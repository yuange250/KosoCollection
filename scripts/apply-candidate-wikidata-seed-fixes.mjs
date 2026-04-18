/**
 * 将 worldscene-candidate-seeds.mjs 中已修正的 wikidataId / summary 同步到
 * data/worldscene/candidate-pois.json 对应 id（按 id 匹配，不整文件重写种子）。
 *
 *   node scripts/apply-candidate-wikidata-seed-fixes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');

const FIXES = [
  {
    id: 'archaeological-site-of-delphi',
    wikidataId: 'Q75459',
    dedupeKey: 'wd:Q75459',
    summary: '帕纳索斯山麓古希腊阿波罗神谕圣地与考古遗址群（世界遗产）。',
  },
  {
    id: 'kinkaku-ji',
    wikidataId: 'Q752725',
    dedupeKey: 'wd:Q752725',
    summary: '京都市鹿苑寺（金阁），室町时代禅宗名刹与世界遗产。',
  },
  {
    id: 'old-havana',
    wikidataId: 'Q1165566',
    dedupeKey: 'wd:Q1165566',
    summary: '哈瓦那殖民时代老城与要塞体系，加勒比海历史城市景观（世界遗产）。',
  },
];

function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const bundle = JSON.parse(raw);
  const byId = new Map(bundle.entries.map((e) => [e.id, e]));
  let n = 0;
  for (const fix of FIXES) {
    const e = byId.get(fix.id);
    if (!e) {
      console.warn('missing entry', fix.id);
      continue;
    }
    e.wikidataId = fix.wikidataId;
    e.dedupeKey = fix.dedupeKey;
    e.summary = fix.summary;
    e.sources = [
      ...(e.sources || []).filter((s) => s.type !== 'wikidata-seed-fix'),
      { type: 'wikidata-seed-fix', note: 'corrected Wikidata Q + summary from seeds' },
    ];
    n += 1;
  }
  bundle.updatedAt = new Date().toISOString();
  bundle.wikidataSeedFixes = { applied: n, ids: FIXES.map((f) => f.id) };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(bundle)}\n`, 'utf8');
  console.log('updated', n, 'entries');
}

main();
