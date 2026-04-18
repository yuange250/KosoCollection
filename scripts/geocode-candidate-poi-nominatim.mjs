/**
 * 为仍缺坐标的候补条目补全 lat/lng。
 * 优先 Nominatim（OSM）；失败或超时时回退 Photon（komoot.io，仅作地理编码，遵守其合理使用）。
 *
 * 模式：
 *   node scripts/geocode-candidate-poi-nominatim.mjs
 *   node scripts/geocode-candidate-poi-nominatim.mjs --wikidata-fallback
 *   node scripts/geocode-candidate-poi-nominatim.mjs --all
 *
 * 环境变量：SLEEP_MS（默认 500）、LIMIT、SKIP_NOMINATIM=1（仅 Photon）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');

const UA = 'KosoCollection-candidate-geocode/1.0 (contact: local-dev)';

function needsCoord(e) {
  const lat = e.lat;
  const lng = e.lng;
  if (lat == null || lng == null) return true;
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return true;
  return false;
}

function buildQuery(e) {
  const parts = [e.name, e.englishName, e.city && e.city !== '—' ? e.city : '', e.country && e.country !== '—' ? e.country : '']
    .filter(Boolean)
    .join(' ');
  return parts.trim() || null;
}

/** 中文名检索失败时再用英文名 + 国家试一次 */
function buildQueryEnglishFallback(e) {
  const en = e.englishName?.trim();
  if (!en) return null;
  const country = e.country && e.country !== '—' ? e.country : '';
  return [en, country].filter(Boolean).join(' ');
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function nominatimSearchOnce(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  const init = {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(22000);
  }
  const r = await fetch(url.toString(), init);
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const data = await r.json();
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function nominatimSearch(q, retries = 2) {
  let last;
  for (let a = 0; a < retries; a += 1) {
    try {
      return await nominatimSearchOnce(q);
    } catch (e) {
      last = e;
      await sleep(1500 * (a + 1));
    }
  }
  throw last;
}

async function photonSearchOnce(q) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '1');
  const init = {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(22000);
  }
  const r = await fetch(url.toString(), init);
  if (!r.ok) throw new Error(`photon ${r.status}`);
  const data = await r.json();
  const f = data.features?.[0];
  if (!f?.geometry?.coordinates?.length) return null;
  const [lng, lat] = f.geometry.coordinates;
  const props = f.properties || {};
  const displayName = [props.name, props.state, props.country].filter(Boolean).join(', ');
  return { lat: Number(lat), lng: Number(lng), display_name: displayName || q };
}

async function photonSearch(q, retries = 2) {
  let last;
  for (let a = 0; a < retries; a += 1) {
    try {
      return await photonSearchOnce(q);
    } catch (e) {
      last = e;
      await sleep(1000 * (a + 1));
    }
  }
  throw last;
}

async function geocodeQuery(q, skipNominatim) {
  if (!skipNominatim) {
    try {
      const hit = await nominatimSearch(q);
      if (hit?.lat != null && hit?.lon != null) {
        return {
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          displayName: hit.display_name,
          engine: 'nominatim',
        };
      }
    } catch {
      /* try photon */
    }
  }
  const p = await photonSearch(q);
  if (p?.lat != null && p?.lng != null) {
    return { lat: p.lat, lng: p.lng, displayName: p.display_name, engine: 'photon-komoot' };
  }
  return null;
}

function parseArgs(argv) {
  if (argv.includes('--all')) return { mode: 'all' };
  if (argv.includes('--wikidata-fallback')) return { mode: 'wikidata-fallback' };
  return { mode: 'no-wikidata' };
}

function stripOldGeocodeSources(sources) {
  return (sources || []).filter((s) => !['nominatim-osm', 'photon-komoot'].includes(s.type));
}

async function runPass(bundle, entries, todo, label) {
  const SLEEP_MS = Number(process.env.SLEEP_MS || 500);
  const skipNominatim = process.env.SKIP_NOMINATIM === '1';
  let filled = 0;
  let failed = 0;
  let nominatimHits = 0;
  let photonHits = 0;

  console.log(`\n--- ${label}: todo ${todo.length} (nominatim${skipNominatim ? ' off' : ' on'} + photon fallback) ---\n`);

  for (let i = 0; i < todo.length; i += 1) {
    const e = todo[i];
    const q = buildQuery(e);
    if (!q) {
      failed += 1;
      continue;
    }
    try {
      let usedQuery = q;
      let hit = await geocodeQuery(q, skipNominatim);
      if (!hit) {
        const q2 = buildQueryEnglishFallback(e);
        if (q2 && q2 !== q) {
          hit = await geocodeQuery(q2, skipNominatim);
          if (hit) usedQuery = q2;
        }
      }
      if (!hit) {
        failed += 1;
        await sleep(SLEEP_MS);
        continue;
      }
      if (hit.engine === 'nominatim') nominatimHits += 1;
      else photonHits += 1;

      e.lat = hit.lat;
      e.lng = hit.lng;
      e.sources = [
        ...stripOldGeocodeSources(e.sources),
        {
          type: hit.engine === 'nominatim' ? 'nominatim-osm' : 'photon-komoot',
          note: label,
          query: usedQuery,
          displayName: hit.displayName,
          engine: hit.engine,
        },
      ];
      filled += 1;
      await sleep(SLEEP_MS);
    } catch (err) {
      console.error('failed', e.id, err?.message || err, err?.cause?.message || '');
      failed += 1;
      await sleep(SLEEP_MS);
    }

    if ((i + 1) % 5 === 0 || i === todo.length - 1) {
      bundle.updatedAt = new Date().toISOString();
      bundle.geocodeBackfill = {
        ...(bundle.geocodeBackfill || {}),
        [label.replace(/\s+/g, '-')]: {
          filled,
          failed,
          attempted: todo.length,
          nominatimHits,
          photonHits,
        },
        engine: 'nominatim+photon',
        lastPassAt: new Date().toISOString(),
      };
      fs.writeFileSync(JSON_PATH, `${JSON.stringify(bundle)}\n`, 'utf8');
      console.log('progress', i + 1, '/', todo.length, 'filled', filled, '(nominatim', nominatimHits, 'photon', photonHits, ')');
    }
  }

  bundle.updatedAt = new Date().toISOString();
  bundle.geocodeBackfill = {
    ...(bundle.geocodeBackfill || {}),
    [label.replace(/\s+/g, '-')]: {
      filled,
      failed,
      attempted: todo.length,
      nominatimHits,
      photonHits,
    },
    engine: 'nominatim+photon',
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(bundle)}\n`, 'utf8');
  console.log(`done ${label}. filled`, filled, 'failed', failed, 'nominatim', nominatimHits, 'photon', photonHits);
  return { filled, failed };
}

async function main() {
  const { mode } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const bundle = JSON.parse(raw);
  const entries = bundle.entries;
  const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;

  const noWd = entries.filter((e) => needsCoord(e) && !e.wikidataId);
  const wdFallback = entries.filter((e) => needsCoord(e) && e.wikidataId);

  if (mode === 'all') {
    let a = noWd;
    if (LIMIT && LIMIT > 0) a = a.slice(0, LIMIT);
    await runPass(bundle, entries, a, 'geocode no wikidataId');
    const raw2 = fs.readFileSync(JSON_PATH, 'utf8');
    const bundle2 = JSON.parse(raw2);
    let b = bundle2.entries.filter((e) => needsCoord(e) && e.wikidataId);
    if (LIMIT && LIMIT > 0) b = b.slice(0, LIMIT);
    await runPass(bundle2, bundle2.entries, b, 'geocode wikidata fallback');
    return;
  }

  if (mode === 'wikidata-fallback') {
    let todo = wdFallback;
    if (LIMIT && LIMIT > 0) todo = todo.slice(0, LIMIT);
    await runPass(bundle, entries, todo, 'geocode wikidata fallback');
    return;
  }

  let todo = noWd;
  if (LIMIT && LIMIT > 0) todo = todo.slice(0, LIMIT);
  await runPass(bundle, entries, todo, 'geocode no wikidataId');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
