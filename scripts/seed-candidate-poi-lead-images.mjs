/**
 * Fast-fill lead images for candidate-only WorldScene POIs.
 *
 * Goal:
 * - prioritize breadth over depth
 * - avoid binary downloads
 * - populate candidate-poi-manifest.json with at least 1 remote image per POI
 *
 * Source priority:
 * 1. Wikidata P18
 * 2. enwiki/zhwiki pageimage
 *
 * Examples:
 *   node scripts/seed-candidate-poi-lead-images.mjs --limit 200
 *   node scripts/seed-candidate-poi-lead-images.mjs --ids alcazar-of-seville,abisko-national-park-kiruna-municipality
 *   node scripts/seed-candidate-poi-lead-images.mjs --replace
 *   node scripts/seed-candidate-poi-lead-images.mjs --shard 0 --shards 4
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const MANIFEST = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');

const USER_AGENT = 'KosoCollection/1.0 (candidate POI lead images; educational)';
const REQUEST_TIMEOUT_MS = 22000;
const API_GAP_MS = Number(process.env.API_GAP_MS || 180);
const BATCH_SIZE = Math.max(10, Math.min(40, Number(process.env.BATCH_SIZE || 30)));
const MIN_SHORT_EDGE = Number(process.env.MIN_SHORT_EDGE || 480);
const ENABLE_WIKIPEDIA_FALLBACK = process.env.ENABLE_WIKIPEDIA_FALLBACK !== '0';
const WIKIDATA_ENTITY_BATCH = Math.max(10, Math.min(25, Number(process.env.WIKIDATA_ENTITY_BATCH || 20)));
const COMMONS_INFO_BATCH = Math.max(8, Math.min(16, Number(process.env.COMMONS_INFO_BATCH || 12)));

let lastApiAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = Math.max(0, API_GAP_MS - (Date.now() - lastApiAt));
  if (wait > 0) await sleep(wait);
  lastApiAt = Date.now();
}

async function fetchJson(url, depth = 0) {
  try {
    if (depth === 0) await throttle();
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if ((res.status === 429 || res.status === 503) && depth < 8) {
      const backoff = Math.min(20000, 1200 * 2 ** depth);
      await sleep(backoff);
      return fetchJson(url, depth + 1);
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  } catch (error) {
    if (depth < 5) {
      const backoff = Math.min(12000, 900 * 2 ** depth);
      await sleep(backoff);
      return fetchJson(url, depth + 1);
    }
    throw error;
  }
}

function parseArgs(argv) {
  const out = {
    limit: null,
    offset: 0,
    replace: false,
    ids: null,
    shard: 0,
    shards: 1,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--limit') {
      out.limit = Number(argv[i + 1]) || null;
      i += 1;
    } else if (value === '--offset') {
      out.offset = Math.max(0, Number(argv[i + 1]) || 0);
      i += 1;
    } else if (value === '--replace') {
      out.replace = true;
    } else if (value === '--ids') {
      out.ids = new Set(
        String(argv[i + 1] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
    } else if (value === '--shard') {
      out.shard = Math.max(0, Number(argv[i + 1]) || 0);
      i += 1;
    } else if (value === '--shards') {
      out.shards = Math.max(1, Number(argv[i + 1]) || 1);
      i += 1;
    }
  }
  return out;
}

function loadBundle() {
  return JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

function manifestPathForWorker(shard, shards) {
  if (shards <= 1) return MANIFEST;
  return path.join(ROOT, 'data', 'worldscene', `candidate-poi-manifest.worker-${shard}-of-${shards}.json`);
}

function loadJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveManifest(filePath, manifest) {
  fs.writeFileSync(filePath, `${JSON.stringify(manifest)}\n`, 'utf8');
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseStringClaim(entity, property) {
  const claims = entity?.claims?.[property];
  if (!claims?.length) return null;
  for (const claim of claims) {
    if (claim.rank === 'deprecated') continue;
    const value = claim?.mainsnak?.datavalue?.value;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function commonsSearchFiles(query, limit = 8) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srnamespace', '6');
  url.searchParams.set('srlimit', String(limit));
  url.searchParams.set('srsearch', query);
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url.toString());
  return (data?.query?.search ?? []).map((row) => row.title).filter(Boolean);
}

async function fetchWikidataEntities(qids) {
  if (!qids.length) return {};
  const out = {};
  for (const ids of chunk(qids, WIKIDATA_ENTITY_BATCH)) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('format', 'json');
    url.searchParams.set('ids', ids.join('|'));
    url.searchParams.set('props', 'claims|sitelinks');
    try {
      const data = await fetchJson(url.toString());
      Object.assign(out, data?.entities ?? {});
    } catch (error) {
      console.warn(`  wikidata batch failed (${ids.length} ids): ${error?.message || error}`);
    }
  }
  return out;
}

async function fetchCommonsInfo(fileTitles) {
  if (!fileTitles.length) return new Map();
  const out = new Map();
  for (const titles of chunk(fileTitles, COMMONS_INFO_BATCH)) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime|size');
    url.searchParams.set('titles', titles.join('|'));
    url.searchParams.set('origin', '*');
    let data;
    try {
      data = await fetchJson(url.toString());
    } catch (error) {
      console.warn(`  commons info batch failed (${titles.length} files): ${error?.message || error}`);
      continue;
    }
    for (const page of Object.values(data?.query?.pages ?? {})) {
      const title = page?.title;
      const info = page?.imageinfo?.[0];
      if (!title || !info?.url) continue;
      out.set(title, {
        title,
        remoteUrl: info.url,
        mime: info.mime || '',
        width: info.width || null,
        height: info.height || null,
      });
    }
  }
  return out;
}

async function fetchWikipediaPageImages(lang, titles) {
  if (!titles.length) return new Map();
  const out = new Map();
  for (const batch of chunk(titles, 20)) {
    const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'pageimages');
    url.searchParams.set('piprop', 'original');
    url.searchParams.set('titles', batch.join('|'));
    url.searchParams.set('origin', '*');
    let data;
    try {
      data = await fetchJson(url.toString());
    } catch {
      continue;
    }
    for (const page of Object.values(data?.query?.pages ?? {})) {
      if (!page?.title || !page?.original?.source) continue;
      out.set(page.title, {
        title: page.title,
        remoteUrl: page.original.source,
        width: page.original.width || null,
        height: page.original.height || null,
      });
    }
  }
  return out;
}

function looksUsable(image) {
  if (!image?.remoteUrl) return false;
  const shortEdge = Math.min(image.width || 0, image.height || 0);
  if (shortEdge && shortEdge < MIN_SHORT_EDGE) return false;
  const title = String(image.title || '').toLowerCase();
  const blocked = ['logo', 'map', 'flag', 'emblem', 'crest', 'coat of arms', 'locator'];
  return !blocked.some((word) => title.includes(word));
}

function buildManifestImage({
  remoteUrl,
  width,
  height,
  title,
  source,
  pageTitle,
  score,
}) {
  return {
    url: remoteUrl,
    remoteUrl,
    width: width || undefined,
    height: height || undefined,
    title,
    source,
    pageTitle,
    score,
    storage: 'remote',
  };
}

function pointSnapshot(entry) {
  return {
    name: entry.name,
    englishName: entry.englishName,
    country: entry.country,
    city: entry.city,
    lat: entry.lat,
    lng: entry.lng,
  };
}

function searchQueriesForEntry(entry) {
  const out = [];
  const push = (value) => {
    const text = String(value || '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  push(`${entry.englishName} ${entry.country}`.trim());
  push(`${entry.englishName} ${entry.city}`.trim());
  push(entry.englishName);
  if (entry.name && entry.name !== entry.englishName) push(`${entry.name} ${entry.country}`.trim());
  return out.slice(0, 4);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = loadBundle();
  const manifestPath = manifestPathForWorker(args.shard, args.shards);
  const mainForSkip = loadManifest();
  const manifest = loadJsonSafe(manifestPath);
  const all = bundle.entries.filter((entry) => entry.wikidataId);

  let candidates = all;
  if (args.ids?.size) candidates = candidates.filter((entry) => args.ids.has(entry.id));
  if (args.shards && args.shard != null) {
    candidates = candidates.filter((_, index) => index % args.shards === args.shard);
  }
  if (args.offset) candidates = candidates.slice(args.offset);
  if (args.limit) candidates = candidates.slice(0, args.limit);

  const targets = candidates.filter((entry) => {
    if (args.replace) return true;
    const count = (manifest[entry.id]?.images?.length ?? 0) || (mainForSkip[entry.id]?.images?.length ?? 0);
    return count < 1;
  });

  console.log(
    `Lead image seed: total=${all.length} selected=${candidates.length} targets=${targets.length} batch=${BATCH_SIZE} manifest=${path.basename(manifestPath)}`,
  );
  if (!targets.length) return;

  let processed = 0;
  let added = 0;
  let skipped = 0;
  let misses = 0;
  let batchFailures = 0;

  for (const batch of chunk(targets, BATCH_SIZE)) {
    let entities = {};
    try {
      const qids = batch.map((entry) => entry.wikidataId).filter(Boolean);
      entities = await fetchWikidataEntities(qids);
    } catch (error) {
      batchFailures += 1;
      console.warn(`  entity fetch failed for batch: ${error?.message || error}`);
      continue;
    }

    const p18Titles = [];
    const p18ById = new Map();
    const enTitles = [];
    const zhTitles = [];
    const enById = new Map();
    const zhById = new Map();

    for (const entry of batch) {
      const entity = entities[entry.wikidataId];
      const p18 = parseStringClaim(entity, 'P18');
      if (p18) {
        const title = p18.startsWith('File:') ? p18 : `File:${p18}`;
        p18Titles.push(title);
        p18ById.set(entry.id, title);
      }
      const enTitle = entity?.sitelinks?.enwiki?.title;
      const zhTitle = entity?.sitelinks?.zhwiki?.title;
      if (enTitle) {
        enTitles.push(enTitle);
        enById.set(entry.id, enTitle);
      }
      if (zhTitle) {
        zhTitles.push(zhTitle);
        zhById.set(entry.id, zhTitle);
      }
    }

    const searchCandidates = new Map();
    for (const entry of batch) {
      searchCandidates.set(entry.id, []);
      if (p18ById.get(entry.id)) continue;
      for (const query of searchQueriesForEntry(entry)) {
        try {
          const found = await commonsSearchFiles(query, 6);
          if (found.length) {
            searchCandidates.set(entry.id, found);
            break;
          }
        } catch {
          // ignore per-query search errors
        }
      }
    }

    const commons = await fetchCommonsInfo([
      ...new Set([
        ...p18Titles,
        ...[...searchCandidates.values()].flat(),
      ]),
    ]);
    const enImages = ENABLE_WIKIPEDIA_FALLBACK
      ? await fetchWikipediaPageImages('en', [...new Set(enTitles)])
      : new Map();
    const zhImages = ENABLE_WIKIPEDIA_FALLBACK
      ? await fetchWikipediaPageImages('zh', [...new Set(zhTitles)])
      : new Map();

    for (const entry of batch) {
      processed += 1;
      const existing = manifest[entry.id] || mainForSkip[entry.id];
      const keep = !args.replace && existing?.images?.length ? existing.images : [];

      let chosen = null;
      const p18Title = p18ById.get(entry.id);
      const enTitle = enById.get(entry.id);
      const zhTitle = zhById.get(entry.id);
      const searchTitles = searchCandidates.get(entry.id) || [];

      const p18Image = p18Title ? commons.get(p18Title) : null;
      if (looksUsable(p18Image)) {
        chosen = buildManifestImage({
          ...p18Image,
          source: 'wikidata-p18-remote',
          pageTitle: entry.wikidataId,
          score: 320,
        });
      }

      if (!chosen && searchTitles.length) {
        for (const title of searchTitles) {
          const image = commons.get(title);
          if (!looksUsable(image)) continue;
          chosen = buildManifestImage({
            ...image,
            source: 'commons-search-remote',
            pageTitle: `${entry.englishName} ${entry.country || ''}`.trim(),
            score: 180,
          });
          break;
        }
      }

      if (!chosen && enTitle) {
        const image = enImages.get(enTitle);
        if (looksUsable(image)) {
          chosen = buildManifestImage({
            ...image,
            source: 'en.wikipedia.org:pageimage',
            pageTitle: enTitle,
            score: 220,
          });
        }
      }

      if (!chosen && zhTitle) {
        const image = zhImages.get(zhTitle);
        if (looksUsable(image)) {
          chosen = buildManifestImage({
            ...image,
            source: 'zh.wikipedia.org:pageimage',
            pageTitle: zhTitle,
            score: 210,
          });
        }
      }

      if (!chosen) {
        misses += 1;
        continue;
      }

      manifest[entry.id] = {
        point: pointSnapshot(entry),
        images: [chosen, ...keep].slice(0, 6),
      };
      added += 1;
    }

    saveManifest(manifestPath, {
      ...manifest,
      _leadSeedAt: new Date().toISOString(),
      _leadSeedMode: 'remote-first',
    });
    console.log(
      `  progress ${processed}/${targets.length} added=${added} misses=${misses} skipped=${skipped} batchFailures=${batchFailures}`,
    );
  }

  console.log(
    `Done. processed=${processed} added=${added} misses=${misses} skipped=${skipped} batchFailures=${batchFailures}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
