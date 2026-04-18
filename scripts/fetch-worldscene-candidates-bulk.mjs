/**
 * 从 Wikidata 多类型分页拉取景点类实体，与手工种子合并去重，生成 5000+ 候选（需可访问 query.wikidata.org）。
 *
 *   node scripts/fetch-worldscene-candidates-bulk.mjs
 *
 * 环境变量:
 *   TARGET=5200          目标最少条数（默认 5200）
 *   BATCH=450            每页条数（默认 450，避免超时）
 *   SLEEP_MS=900         请求间隔毫秒
 *   DRY_RUN=1            只跑少量请求用于测试
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_TS,
  OUT_JSON,
  parseExistingDestinationIds,
  seedsToEntries,
  writeBundle,
} from './lib/worldscene-candidates-core.mjs';
import { CANDIDATE_SEEDS } from './worldscene-candidate-seeds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function continentEnToRegion(continentEn) {
  if (!continentEn) return '—';
  const map = {
    Asia: '亚洲',
    Europe: '欧洲',
    Africa: '非洲',
    'North America': '北美',
    'South America': '南美',
    Oceania: '大洋洲',
    Antarctica: '南极洲',
  };
  return map[continentEn] || '—';
}

function parseCoord(coordVal) {
  if (!coordVal) return { lat: null, lng: null };
  const v = String(coordVal);
  if (v.includes('Point(')) {
    const m = /Point\(([-\d.]+)\s+([-\d.]+)\)/.exec(v);
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) };
  }
  return { lat: null, lng: null };
}

/** SPARQL：?item 为主体，可选 ?coord；多语言标签。 */
function buildSparql(whereInner, limit, offset) {
  return `
SELECT ?item ?en ?zh ?coord ?countryEn ?continentEn ?adminEn WHERE {
  ${whereInner}
  OPTIONAL { ?item rdfs:label ?en . FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?zh . FILTER(lang(?zh) = "zh") }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL {
    ?item wdt:P17 ?countryItem .
    ?countryItem rdfs:label ?countryEn . FILTER(lang(?countryEn) = "en")
    OPTIONAL {
      ?countryItem wdt:P30 ?cont .
      ?cont rdfs:label ?continentEn . FILTER(lang(?continentEn) = "en")
    }
  }
  OPTIONAL {
    ?item wdt:P131 ?admin .
    ?admin rdfs:label ?adminEn . FILTER(lang(?adminEn) = "en")
  }
}
LIMIT ${limit} OFFSET ${offset}
`;
}

const SPECS = [
  {
    key: 'unesco',
    where: '?item wdt:P1435 wd:Q9259 .',
    category: '人文古迹',
    prominence: 'world-famous',
    tags: ['UNESCO', '世界遗产'],
    summary: 'Wikidata P1435',
  },
  {
    key: 'national_park',
    where: '?item wdt:P31 wd:Q46169 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'national',
    tags: ['国家公园'],
    summary: 'Wikidata P31=Q46169',
  },
  {
    key: 'castle',
    where: '?item wdt:P31 wd:Q23413 . ?item wdt:P625 ?coord .',
    category: '人文古迹',
    prominence: 'regional',
    tags: ['城堡'],
    summary: 'Wikidata P31=Q23413',
  },
  {
    key: 'beach',
    where: '?item wdt:P31 wd:Q40080 . ?item wdt:P625 ?coord .',
    category: '海岛度假',
    prominence: 'regional',
    tags: ['海滩'],
    summary: 'Wikidata P31=Q40080',
  },
  {
    key: 'palace',
    where: '?item wdt:P31 wd:Q16560 . ?item wdt:P625 ?coord .',
    category: '人文古迹',
    prominence: 'national',
    tags: ['宫殿'],
    summary: 'Wikidata P31=Q16560',
  },
  {
    key: 'waterfall',
    where: '?item wdt:P31 wd:Q34038 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['瀑布'],
    summary: 'Wikidata P31=Q34038',
  },
  {
    key: 'archaeological_site',
    where: '?item wdt:P31 wd:Q839954 . ?item wdt:P625 ?coord .',
    category: '人文古迹',
    prominence: 'national',
    tags: ['考古遗址'],
    summary: 'Wikidata P31=Q839954',
  },
  {
    key: 'monastery',
    where: '?item wdt:P31 wd:Q44613 . ?item wdt:P625 ?coord .',
    category: '人文古迹',
    prominence: 'regional',
    tags: ['修道院'],
    summary: 'Wikidata P31=Q44613',
  },
  {
    key: 'protected_area',
    where: '?item wdt:P31 wd:Q473972 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['保护区'],
    summary: 'Wikidata P31=Q473972',
  },
  {
    key: 'tourist_attraction',
    where: '?item wdt:P31 wd:Q570116 . ?item wdt:P625 ?coord .',
    category: '城市地标',
    prominence: 'regional',
    tags: ['旅游点'],
    summary: 'Wikidata P31=Q570116',
  },
  {
    key: 'natural_monument',
    where: '?item wdt:P31 wd:Q4963428 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'niche',
    tags: ['自然纪念物'],
    summary: 'Wikidata P31=Q4963428',
  },
  {
    key: 'observation_deck',
    where: '?item wdt:P31 wd:Q1069923 . ?item wdt:P625 ?coord .',
    category: '城市地标',
    prominence: 'regional',
    tags: ['观景台'],
    summary: 'Wikidata P31=Q1069923',
  },
  {
    key: 'ruins',
    where: '?item wdt:P31 wd:Q109607 . ?item wdt:P625 ?coord .',
    category: '人文古迹',
    prominence: 'regional',
    tags: ['废墟', '遗迹'],
    summary: 'Wikidata P31=Q109607 ruins',
  },
  {
    key: 'garden',
    where: '?item wdt:P31 wd:Q22746 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['园林'],
    summary: 'Wikidata P31=Q22746',
  },
  {
    key: 'dam',
    where: '?item wdt:P31 wd:Q12323 . ?item wdt:P625 ?coord .',
    category: '城市地标',
    prominence: 'regional',
    tags: ['水坝'],
    summary: 'Wikidata P31=Q12323',
  },
  {
    key: 'cave',
    where: '?item wdt:P31 wd:Q35509 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['洞穴'],
    summary: 'Wikidata P31=Q35509',
  },
  {
    key: 'strait',
    where: '?item wdt:P31 wd:Q39808 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'niche',
    tags: ['海峡'],
    summary: 'Wikidata P31=Q39808',
  },
  {
    key: 'desert',
    where: '?item wdt:P31 wd:Q851409 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['沙漠'],
    summary: 'Wikidata P31=Q851409',
  },
  {
    key: 'glacier',
    where: '?item wdt:P31 wd:Q35666 . ?item wdt:P625 ?coord .',
    category: '自然景观',
    prominence: 'regional',
    tags: ['冰川'],
    summary: 'Wikidata P31=Q35666',
  },
  {
    key: 'island',
    where: '?item wdt:P31 wd:Q23442 . ?item wdt:P625 ?coord .',
    category: '海岛度假',
    prominence: 'regional',
    tags: ['岛屿'],
    summary: 'Wikidata P31=Q23442',
  },
];

/** 固定种子打乱 SPECS，减轻「按类型顺序拉取」带来的地域偏置（可改种子重新拉取）。 */
function shuffleDeterministic(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchSparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'KosoCollection-fetch-worldscene-candidates-bulk/1.0',
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Wikidata HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** 手工种子优先保留文案，但从 bulk 补同一 wikidataId 的坐标（避免种子无 P625 覆盖 bulk 有坐标）。 */
function mergeBulkCoordsIntoManualSeeds(manualSeeds, bulkSeeds) {
  const byWd = new Map();
  for (const b of bulkSeeds) {
    if (!b?.wikidataId) continue;
    if (b.lat == null || b.lng == null || Number.isNaN(Number(b.lat))) continue;
    if (!byWd.has(b.wikidataId)) byWd.set(b.wikidataId, b);
  }
  for (const m of manualSeeds) {
    if (!m.wikidataId) continue;
    if (m.lat != null && m.lng != null && !Number.isNaN(Number(m.lat))) continue;
    const b = byWd.get(m.wikidataId);
    if (!b) continue;
    m.lat = b.lat;
    m.lng = b.lng;
  }
}

function bindingToSeed(b, spec) {
  const uri = b.item?.value;
  if (!uri) return null;
  const wikidataId = uri.split('/').pop();
  const en = b.en?.value?.trim();
  const zh = b.zh?.value?.trim();
  const label = zh || en;
  if (!label) return null;
  const englishName = en || zh || label;
  const { lat, lng } = parseCoord(b.coord?.value);
  const countryEn = b.countryEn?.value?.trim() || '—';
  const region = continentEnToRegion(b.continentEn?.value?.trim());
  const adminEn = b.adminEn?.value?.trim();
  const city = adminEn && adminEn.length < 80 ? adminEn : '—';

  return {
    name: zh || en || label,
    englishName,
    aliases: [],
    country: countryEn === '—' ? '—' : countryEn,
    region,
    city,
    category: spec.category,
    prominence: spec.prominence,
    tags: [...spec.tags],
    summary: spec.summary,
    lat,
    lng,
    wikidataId,
    sources: [{ type: 'wikidata-bulk', key: spec.key, url: uri }],
  };
}

async function main() {
  const TARGET = Number(process.env.TARGET || 5200);
  const BATCH = Number(process.env.BATCH || 450);
  const SLEEP_MS = Number(process.env.SLEEP_MS || 900);
  const DRY = process.env.DRY_RUN === '1';

  const ts = fs.readFileSync(DATA_TS, 'utf8');
  const existingIds = parseExistingDestinationIds(ts);

  const bulkSeeds = [];
  const seenWd = new Set();

  let requestCount = 0;
  const specList = shuffleDeterministic(SPECS, Number(process.env.SPEC_SEED || 42));
  outer: for (const spec of specList) {
    let offset = 0;
    const maxOffset = DRY ? BATCH * 3 : 80000;
    while (offset < maxOffset) {
      if (seenWd.size >= Number(process.env.WD_CAP || 5600)) break outer;
      const q = buildSparql(spec.where, BATCH, offset);
      let data;
      try {
        data = await fetchSparql(q);
      } catch (e) {
        console.error(spec.key, 'offset', offset, e.message);
        break;
      }
      requestCount += 1;
      const rows = data.results?.bindings ?? [];
      if (rows.length === 0) break;

      for (const b of rows) {
        const seed = bindingToSeed(b, spec);
        if (!seed || !seed.wikidataId) continue;
        if (seenWd.has(seed.wikidataId)) continue;
        seenWd.add(seed.wikidataId);
        bulkSeeds.push(seed);
      }

      console.log(spec.key, 'offset', offset, 'batch', rows.length, 'uniqueWd', seenWd.size);
      if (rows.length < BATCH) break;
      offset += BATCH;
      await sleep(SLEEP_MS);

      if (DRY && requestCount >= 4) break outer;
    }
  }

  const manualSeeds = CANDIDATE_SEEDS.map((s) => ({ ...s }));
  mergeBulkCoordsIntoManualSeeds(manualSeeds, bulkSeeds);
  const combined = [...manualSeeds, ...bulkSeeds];
  const { entries, duplicates } = seedsToEntries(combined, existingIds);

  const compact = entries.length > 800;
  const bundle = writeBundle(entries, {
    sources: ['scripts/worldscene-candidate-seeds.mjs', 'wikidata-bulk-sparql'],
    existingAppPointCount: existingIds.size,
    duplicateSeedsSkipped: duplicates.length,
    bulkFetchedFromWikidata: bulkSeeds.length,
    targetMin: TARGET,
    geoNote:
      '地域分布受 Wikidata 实体数量与排序影响；已打乱 SPECS 顺序（SPEC_SEED）并 ORDER BY ?item。若需各大洲更均衡，可按洲拆分 SPARQL 条件分批拉取。',
  }, { compact });

  console.log('done. total entries:', bundle.entries.length, 'duplicates skipped:', duplicates.length);
  console.log('wrote', OUT_JSON, compact ? '(compact JSON)' : '');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
