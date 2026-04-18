/**
 * WorldScene 扩充用候选景点清单：合并种子、去重、与已上架景点比对。
 *
 * 用法:
 *   node scripts/worldscene-candidates.mjs write       # 从种子生成 data/worldscene/candidate-pois.json
 *   node scripts/worldscene-candidates.mjs stats
 *   node scripts/worldscene-candidates.mjs overlap
 *   node scripts/worldscene-candidates.mjs wikidata   # 仅世界遗产一批（需网络）
 *
 * 大批量（5000+）请用: npm run candidates:worldscene:bulk
 */
import fs from 'node:fs';
import {
  DATA_TS,
  OUT_JSON,
  parseExistingDestinationIds,
  seedsToEntries,
  writeBundle,
} from './lib/worldscene-candidates-core.mjs';
import { CANDIDATE_SEEDS } from './worldscene-candidate-seeds.mjs';

const WIKIDATA_QUERY = `
SELECT ?site ?siteLabel ?coord ?countryLabel ?siteZh WHERE {
  ?site wdt:P1435 wd:Q9259 .
  OPTIONAL { ?site wdt:P625 ?coord . }
  OPTIONAL { ?site wdt:P17 ?c . ?c rdfs:label ?countryLabel . FILTER((lang(?countryLabel)) = "en") }
  OPTIONAL { ?site rdfs:label ?siteZh . FILTER((lang(?siteZh)) = "zh") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,zh". }
}
LIMIT ${Number(process.env.WIKIDATA_LIMIT || 300)}
`;

async function cmdWikidata() {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(WIKIDATA_QUERY)}`;
  const r = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'KosoCollection-worldscene-candidates/1.0 (https://github.com/)',
    },
  });
  if (!r.ok) throw new Error(`Wikidata ${r.status}`);
  const data = await r.json();
  const bindings = data.results?.bindings ?? [];
  const seeds = [];
  for (const b of bindings) {
    const uri = b.site?.value;
    const wikidataId = uri ? uri.split('/').pop() : null;
    const en = b.siteLabel?.value;
    const zh = b.siteZh?.value;
    const coord = b.coord?.value;
    let lat = null;
    let lng = null;
    if (coord && String(coord).includes('Point(')) {
      const m = /Point\(([-\d.]+)\s+([-\d.]+)\)/.exec(String(coord));
      if (m) {
        lng = Number(m[1]);
        lat = Number(m[2]);
      }
    }
    const country = b.countryLabel?.value ?? '';
    if (!en) continue;
    seeds.push({
      name: zh || en,
      englishName: en,
      aliases: [],
      country: country || '—',
      region: '—',
      city: '—',
      category: '人文古迹',
      prominence: 'world-famous',
      tags: ['UNESCO', '世界遗产'],
      summary: 'Wikidata: UNESCO World Heritage (Wikidata P1435=Q9259)',
      lat,
      lng,
      wikidataId,
      sources: [{ type: 'wikidata-sparql', url: uri }],
    });
  }
  const ts = fs.readFileSync(DATA_TS, 'utf8');
  const existingIds = parseExistingDestinationIds(ts);
  const { entries, duplicates } = seedsToEntries(seeds, existingIds);
  console.log('wikidata rows:', bindings.length, 'unique entries:', entries.length, 'internal dupes:', duplicates.length);
  const bundle = writeBundle(entries, {
    sources: ['wikidata-unesco-whs'],
    note: 'Run `node scripts/worldscene-candidates.mjs write` to rebuild from seeds only.',
  });
  cmdStats(bundle);
}

function cmdStats(bundle) {
  const byRegion = {};
  const byCat = {};
  const byProm = {};
  for (const e of bundle.entries) {
    byRegion[e.region] = (byRegion[e.region] || 0) + 1;
    byCat[e.category] = (byCat[e.category] || 0) + 1;
    byProm[e.prominence] = (byProm[e.prominence] || 0) + 1;
  }
  console.log('entries', bundle.entries.length);
  console.log('byRegion', byRegion);
  console.log('byCategory', byCat);
  console.log('byProminence', byProm);
}

function cmdOverlap(bundle) {
  const ts = fs.readFileSync(DATA_TS, 'utf8');
  const existing = parseExistingDestinationIds(ts);
  const hits = bundle.entries.filter((e) => existing.has(e.id));
  console.log('existing ids in worldsceneData.ts:', existing.size);
  console.log('candidate entries with same id as app:', hits.length);
  for (const h of hits.slice(0, 30)) {
    console.log(' ', h.id, h.name);
  }
  if (hits.length > 30) console.log('  ...');
}

function main() {
  const cmd = process.argv[2] || 'write';

  if (cmd === 'wikidata') {
    cmdWikidata().catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    });
    return;
  }

  const ts = fs.readFileSync(DATA_TS, 'utf8');
  const existingIds = parseExistingDestinationIds(ts);

  if (cmd === 'write' && fs.existsSync(OUT_JSON)) {
    try {
      const prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8'));
      if (Number(prev.bulkFetchedFromWikidata || 0) > 200) {
        console.warn(
          '[警告] 当前 candidate-pois.json 含 Wikidata 大批量拉取结果；执行 write 将仅用种子覆盖并丢失 bulk。若要保留请先备份 data/worldscene/candidate-pois.json',
        );
      }
    } catch {
      /* ignore */
    }
  }

  const { entries, duplicates } = seedsToEntries(CANDIDATE_SEEDS, existingIds);

  if (duplicates.length) {
    console.warn('deduped (skipped) duplicates:', duplicates.length);
    for (const d of duplicates.slice(0, 15)) {
      console.warn(' ', d.dedupeKey, '→ kept', d.kept);
    }
  }

  const bundle = writeBundle(entries, {
    sources: ['scripts/worldscene-candidate-seeds.mjs'],
    existingAppPointCount: existingIds.size,
    duplicateSeedsSkipped: duplicates.length,
  }, { compact: entries.length > 800 });

  if (cmd === 'stats') cmdStats(bundle);
  else if (cmd === 'overlap') cmdOverlap(bundle);
  else {
    console.log('wrote', OUT_JSON, 'entries:', entries.length);
  }
}

main();
