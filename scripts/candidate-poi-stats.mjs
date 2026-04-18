/**
 * 打印 candidate-pois.json 健康度统计（不写文件）。
 *   node scripts/candidate-poi-stats.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '..', 'data', 'worldscene', 'candidate-pois.json');

function needsCoord(e) {
  const lat = e.lat;
  const lng = e.lng;
  if (lat == null || lng == null) return true;
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return true;
  return false;
}

function isStubSummary(s) {
  const t = String(s ?? '').trim();
  if (!t) return true;
  return /^Wikidata/i.test(t);
}

const raw = fs.readFileSync(JSON_PATH, 'utf8');
const bundle = JSON.parse(raw);
const entries = bundle.entries;

let missingCoord = 0;
let stubSummary = 0;
let missingCoordWithWd = 0;
let missingCoordNoWd = 0;
let descriptionEnriched = 0;

for (const e of entries) {
  if (needsCoord(e)) {
    missingCoord += 1;
    if (e.wikidataId) missingCoordWithWd += 1;
    else missingCoordNoWd += 1;
  }
  if (isStubSummary(e.summary)) stubSummary += 1;
  if ((e.sources || []).some((s) => s.type === 'wikidata-descriptions')) descriptionEnriched += 1;
}

console.log(JSON.stringify({
  updatedAt: bundle.updatedAt,
  total: entries.length,
  missingCoord,
  missingCoordWithWikidataId: missingCoordWithWd,
  missingCoordNoWikidataId: missingCoordNoWd,
  stubSummaryWikidataStyle: stubSummary,
  descriptionEnrichedFromWikidata: descriptionEnriched,
  coordBackfill: bundle.coordBackfill ?? null,
  descriptionBackfill: bundle.descriptionBackfill ?? null,
  geocodeBackfill: bundle.geocodeBackfill ?? null,
}, null, 2));
