/**
 * 为 candidate-pois.json 中缺经纬度但有 wikidataId 的条目，从 Wikidata API 回填 P625。
 *
 *   node scripts/backfill-candidate-poi-coords.mjs
 *
 * 环境变量 BATCH=40 SLEEP_MS=200
 * 注意：匿名 wbgetentities 的 ids 每请求上限为 50，超过会返回 toomanyvalues（无 entities）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');

function needsCoord(e) {
  const lat = e.lat;
  const lng = e.lng;
  if (lat == null || lng == null) return true;
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return true;
  return false;
}

const RANK_ORDER = { preferred: 0, normal: 1, deprecated: 9 };

function parseP625(entity) {
  const claims = entity?.claims?.P625;
  if (!claims?.length) return null;
  const sorted = [...claims].sort(
    (a, b) => (RANK_ORDER[a.rank] ?? 5) - (RANK_ORDER[b.rank] ?? 5),
  );
  for (const claim of sorted) {
    if (claim.rank === 'deprecated') continue;
    const v = claim?.mainsnak?.datavalue?.value;
    if (!v) continue;
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number') {
      return { lat: v.latitude, lng: v.longitude };
    }
  }
  return null;
}

async function fetchCoordsForIds(ids) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', ids.join('|'));
  url.searchParams.set('props', 'claims');
  url.searchParams.set('format', 'json');
  const init = {
    headers: { 'User-Agent': 'KosoCollection-backfill-coords/1.0 (contact: local-dev)' },
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(60000);
  }
  const r = await fetch(url.toString(), init);
  if (!r.ok) throw new Error(`wbgetentities ${r.status}`);
  const data = await r.json();
  if (data.error) {
    const { code, info } = data.error;
    throw new Error(`wbgetentities error: ${code} — ${info}`);
  }
  return data;
}

async function fetchWithRetry(ids, retries = 3) {
  let last;
  for (let a = 0; a < retries; a += 1) {
    try {
      return await fetchCoordsForIds(ids);
    } catch (e) {
      last = e;
      await sleep(1500 * (a + 1));
    }
  }
  throw last;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const bundle = JSON.parse(raw);
  const entries = bundle.entries;
  // Wikidata 匿名 API：ids 每请求最多 50，否则 toomanyvalues 且无 entities
  const BATCH = Math.min(
    50,
    Math.max(1, Number(process.env.BATCH || 15)),
  );
  const SLEEP_MS = Number(process.env.SLEEP_MS || 350);

  const todo = entries.filter((e) => needsCoord(e) && e.wikidataId);
  console.log('entries', entries.length, 'missing coords with wikidataId', todo.length);

  let filled = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const ids = chunk.map((e) => e.wikidataId);
    let data;
    try {
      data = await fetchWithRetry(ids);
    } catch (e) {
      console.error('batch failed', e.message);
      break;
    }
    const ents = data.entities ?? {};
    let chunkFilled = 0;
    for (const e of chunk) {
      const ent = ents[e.wikidataId];
      const c = parseP625(ent);
      if (!c) continue;
      e.lat = c.lat;
      e.lng = c.lng;
      e.sources = [
        ...(e.sources || []).filter((s) => s.type !== 'coords-backfill'),
        { type: 'coords-backfill', note: 'Wikidata P625 via wbgetentities' },
      ];
      filled += 1;
      chunkFilled += 1;
    }
    console.log('progress', Math.min(i + BATCH, todo.length), '/', todo.length, 'filled this run:', filled);
    await sleep(SLEEP_MS);
  }

  bundle.updatedAt = new Date().toISOString();
  bundle.coordBackfill = { filled, attempted: todo.length, note: 'Wikidata P625' };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(bundle)}\n`, 'utf8');
  console.log('done. filled', filled, 'of', todo.length);

  let still = 0;
  for (const e of bundle.entries) {
    if (needsCoord(e)) still += 1;
  }
  console.log('still missing coords (any):', still);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
