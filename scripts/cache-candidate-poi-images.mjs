/**
 * Cache images for candidate-only WorldScene POIs.
 *
 * Writes:
 * - images: public/images/worldscene-candidates/
 * - manifest: data/worldscene/candidate-poi-manifest.json
 *
 * It never modifies published POI files such as:
 * - src/lib/worldsceneData.ts
 * - public/images/worldscene/poi-manifest.json
 * - src/lib/worldscenePoiCatalog.gen.ts
 * - src/lib/worldscenePoiCached.gen.ts
 *
 * Strategy:
 * 1. Wikidata P18
 * 2. Wikidata Commons category (P373 / commonswiki sitelink)
 * 3. Commons file search using multi-query search terms
 * 4. en/zh Wikipedia pageimage + page file images enriched through Commons metadata
 *
 * Examples:
 *   node scripts/cache-candidate-poi-images.mjs
 *   node scripts/cache-candidate-poi-images.mjs --limit 50
 *   node scripts/cache-candidate-poi-images.mjs --offset 500 --limit 200
 *   node scripts/cache-candidate-poi-images.mjs --replace
 *   node scripts/cache-candidate-poi-images.mjs --ids id1,id2
 *   node scripts/cache-candidate-poi-images.mjs --shard 0 --shards 2
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseExistingDestinationIds } from './lib/worldscene-candidates-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const CANDIDATE_JSON = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene-candidates');
const MANIFEST_BASE = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');

const USER_AGENT = 'KosoCollection/1.0 (candidate POI image cache; educational)';
const REQUEST_TIMEOUT_MS = 22000;
const PAGE_IMAGE_LIMIT = Math.min(48, Number(process.env.PAGE_IMAGE_LIMIT || 20));
const MIN_VALID_BYTES = 35 * 1024;
const IMAGE_MAX_WIDTH = Math.max(640, Number(process.env.IMAGE_MAX_WIDTH || 1600));

const MIN_IMAGES = Math.max(1, Number(process.env.MIN_IMAGES || 5));
const MAX_IMAGES = Math.min(12, Math.max(MIN_IMAGES, Number(process.env.MAX_IMAGES || 6)));
const DOWNLOAD_DELAY_MS = Number(process.env.DOWNLOAD_DELAY_MS || 12000);
const INTER_ENTRY_DELAY_MS = Number(process.env.INTER_ENTRY_DELAY_MS || 22000);
const API_GAP_MS = Number(process.env.API_GAP_MS || 1200);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastApiAt = 0;
async function throttleApi() {
  const wait = Math.max(0, API_GAP_MS - (Date.now() - lastApiAt));
  if (wait > 0) await sleep(wait);
  lastApiAt = Date.now();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[_()[\]{}.,/\\:'"!?&\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function canonicalImageKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function isImageUrl(url) {
  const value = String(url || '').toLowerCase().split('?')[0];
  return /\.(jpe?g|png|webp)$/.test(value);
}

function wikimediaThumbUrl(url, width = IMAGE_MAX_WIDTH) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'upload.wikimedia.org') return url;
    if (parsed.pathname.includes('/thumb/')) return url;
    if (!isImageUrl(parsed.pathname)) return url;

    const parts = parsed.pathname.split('/');
    const fileName = parts.at(-1);
    if (!fileName) return url;
    const dir = parts.slice(0, -1).join('/');
    parsed.pathname = `${dir.replace('/commons/', '/commons/thumb/')}/${fileName}/${width}px-${fileName}`;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function scoreTextMatch(haystack, needles) {
  const text = normalizeText(haystack);
  let score = 0;
  for (const needle of needles) {
    const norm = normalizeText(needle);
    if (!norm) continue;
    if (text.includes(norm)) score += norm.length >= 4 ? 25 : 10;
  }
  return score;
}

function filePenalty(name) {
  const text = normalizeText(name);
  const bad = [
    'map',
    'locator',
    'plan',
    'logo',
    'flag',
    'symbol',
    'crest',
    'coat of arms',
    'route',
    'icon',
    'disambiguation',
    'svg',
    'banner',
    'seal',
    'emblem',
    'blazon',
    'insignia',
    'marker',
  ];
  return bad.some((t) => text.includes(t)) ? 120 : 0;
}

function isAllowedMime(mime) {
  return /^image\/(jpeg|png|webp)$/i.test(mime);
}

function qualityPenalty(width, height) {
  if (!width || !height) return 0;
  let p = 0;
  if (width < 480 || height < 320) p += 150;
  const ratio = width / height;
  if (ratio > 2.6 || ratio < 0.45) p += 60;
  return p;
}

function qualityBonus(width, height) {
  if (!width || !height) return 0;
  const px = width * height;
  if (px >= 2_000_000) return 60;
  if (px >= 1_000_000) return 40;
  return 10;
}

async function fetchJson(url, depth = 0) {
  if (depth === 0) await throttleApi();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 429 || res.status === 503) {
    const ra = res.headers.get('retry-after');
    const sec = ra ? Number.parseInt(ra, 10) : NaN;
    const fromHeader = Number.isFinite(sec) && sec > 0 ? sec * 1000 : null;
    const backoff = fromHeader ?? Math.min(180000, 12000 * 2 ** depth);
    console.log(`  api ${res.status}, wait ${Math.round(backoff / 1000)}s (depth ${depth})`);
    await sleep(backoff);
    if (depth < 10) return fetchJson(url, depth + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function downloadBinary(url, outFile) {
  const attempts = Number(process.env.DOWNLOAD_RETRIES || 8);
  let lastErr;
  for (let a = 0; a < attempts; a += 1) {
    try {
      if (a === 0) await throttleApi();
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(120000),
      });
      if (res.status === 429 || res.status === 503) {
        const ra = res.headers.get('retry-after');
        const sec = ra ? Number.parseInt(ra, 10) : NaN;
        const fromHeader = Number.isFinite(sec) && sec > 0 ? sec * 1000 : null;
        const backoff = fromHeader ?? Math.min(300000, 15000 * 2 ** a);
        console.log(`  http ${res.status}, backoff ${Math.round(backoff / 1000)}s`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outFile, buf);
      await sleep(DOWNLOAD_DELAY_MS);
      return;
    } catch (e) {
      lastErr = e;
      if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
      const backoff = Math.min(180000, 8000 * 2 ** a);
      console.log(`  retry ${a + 1}/${attempts} after ${Math.round(backoff / 1000)}s (${e?.message || e})`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

function extFromMime(mime, url) {
  if (/png/i.test(mime)) return 'png';
  if (/webp/i.test(mime)) return 'webp';
  const lower = String(url).toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  return 'jpg';
}

async function wikipediaSearch(lang, query) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', '6');
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url.toString());
  return data?.query?.search ?? [];
}

async function wikipediaPageData(lang, title) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'pageimages|images');
  url.searchParams.set('titles', title);
  url.searchParams.set('piprop', 'original');
  url.searchParams.set('imlimit', String(PAGE_IMAGE_LIMIT));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url.toString());
  const pages = data?.query?.pages ?? {};
  return Object.values(pages)[0] ?? null;
}

async function commonsImageInfo(fileTitles) {
  if (!fileTitles.length) return [];
  const batch = Math.max(4, Math.min(12, Number(process.env.COMMONS_BATCH || 8)));
  const chunks = [];
  for (let i = 0; i < fileTitles.length; i += batch) chunks.push(fileTitles.slice(i, i + batch));

  const out = [];
  for (let c = 0; c < chunks.length; c += 1) {
    if (c > 0) await sleep(API_GAP_MS);
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'imageinfo|categories');
    url.searchParams.set('iiprop', 'url|mime|timestamp|size');
    url.searchParams.set('iiurlwidth', String(IMAGE_MAX_WIDTH));
    url.searchParams.set('cllimit', '12');
    url.searchParams.set('titles', chunks[c].join('|'));
    url.searchParams.set('origin', '*');
    const data = await fetchJson(url.toString());
    const rows = Object.values(data?.query?.pages ?? {})
      .map((page) => {
        const title = page?.title;
        const info = page?.imageinfo?.[0];
        if (!title || !info?.url) return null;
        const categories = (page?.categories ?? []).map((it) =>
          String(it.title || '').replace(/^Category:/i, ''),
        );
        return {
          title,
          url: info.thumburl || info.url,
          originalUrl: info.url,
          mime: info.mime || '',
          timestamp: info.timestamp || null,
          width: Number(info.width) || undefined,
          height: Number(info.height) || undefined,
          downloadWidth: Number(info.thumbwidth) || Number(info.width) || undefined,
          downloadHeight: Number(info.thumbheight) || Number(info.height) || undefined,
          description: '',
          categories,
        };
      })
      .filter(Boolean);
    out.push(...rows);
  }
  return out;
}

async function commonsSearchFiles(query, limit = 10) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srnamespace', '6');
  url.searchParams.set('srlimit', String(limit));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url.toString());
  return (data?.query?.search ?? []).map((row) => row.title).filter(Boolean);
}

async function commonsCategoryMembers(categoryTitle, limit = 20) {
  const title = String(categoryTitle || '').replace(/^Category:/i, '');
  if (!title) return [];
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'categorymembers');
  url.searchParams.set('cmtitle', `Category:${title}`);
  url.searchParams.set('cmnamespace', '6');
  url.searchParams.set('cmlimit', String(limit));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url.toString());
  return (data?.query?.categorymembers ?? []).map((row) => row.title).filter(Boolean);
}

function parseStringClaim(entity, property) {
  const claims = entity?.claims?.[property];
  if (!claims?.length) return null;
  for (const claim of claims) {
    const v = claim?.mainsnak?.datavalue?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function parseP18Filename(entity) {
  return parseStringClaim(entity, 'P18');
}

async function fetchWikidataForImages(qid) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('props', 'claims|sitelinks');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  const ent = data.entities?.[qid];
  if (!ent || ent.missing) {
    return { p18File: null, commonsCategory: null };
  }
  return {
    p18File: parseP18Filename(ent),
    commonsCategory:
      parseStringClaim(ent, 'P373') || ent?.sitelinks?.commonswiki?.title?.replace(/^Category:/i, '') || null,
  };
}

function candidateToPoint(entry) {
  return {
    id: entry.id,
    name: entry.name,
    englishName: entry.englishName || entry.name,
    country: entry.country || '—',
    city: entry.city || '—',
    aliases: entry.aliases || [],
    lat: entry.lat,
    lng: entry.lng,
  };
}

function buildNeedles(point, entry) {
  return uniq([
    point.name,
    point.englishName,
    point.city,
    point.country,
    ...(point.aliases || []),
    entry.summary,
  ]);
}

function buildSearchQueries(point, entry) {
  const country = point.country && point.country !== '—' ? point.country : '';
  const city = point.city && point.city !== '—' ? point.city : '';
  const names = uniq([
    point.englishName,
    point.name,
    ...(point.aliases || []).slice(0, 6),
    String(entry.summary || '').trim(),
  ]).filter(Boolean);

  const out = [];
  const push = (value) => {
    const s = String(value || '').trim();
    if (s.length >= 4 && !out.includes(s)) out.push(s);
  };

  for (const n of names.slice(0, 8)) {
    const base = String(n).split(/[,(]/)[0]?.trim() || String(n).trim();
    push(`${base} ${country}`.trim());
    push(`${base} ${city} ${country}`.trim());
    push(base);
  }
  return out.slice(0, 12);
}

function scoreImageRow(point, entry, item) {
  const needles = buildNeedles(point, entry);
  const blob = `${item.title} ${item.description} ${(item.categories || []).join(' ')}`;
  return (
    scoreTextMatch(item.title, needles) * 2 +
    scoreTextMatch(blob, needles) -
    filePenalty(item.title) -
    qualityPenalty(item.width, item.height) +
    qualityBonus(item.width, item.height)
  );
}

function dedupe(images) {
  const best = new Map();
  for (const image of images) {
    if (!isImageUrl(image.remoteUrl || image.url)) continue;
    const key = canonicalImageKey(image.remoteUrl || image.url);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || (image.score || 0) > (prev.score || 0)) {
      best.set(key, image);
    }
  }
  return [...best.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function safeFileBase(id) {
  let s = String(id).replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length > 100) s = s.slice(0, 100);
  return s || 'poi';
}

async function resolveImagesForCandidate(entry) {
  const point = candidateToPoint(entry);
  const collected = [];
  const seenTitle = new Set();
  const seenUrl = new Set();

  const pushCollected = (item) => {
    const urlKey = canonicalImageKey(item.remoteUrl || item.url);
    const titleKey = normalizeText(item.title);
    if (!urlKey || seenUrl.has(urlKey)) return false;
    if (titleKey && seenTitle.has(titleKey)) return false;
    seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    collected.push(item);
    return true;
  };

  if (entry.wikidataId) {
    try {
      const { p18File, commonsCategory } = await fetchWikidataForImages(entry.wikidataId);

      if (p18File) {
        const infos = await commonsImageInfo([`File:${p18File.replace(/^File:/i, '')}`]);
        const item = infos[0];
        if (item?.url && isAllowedMime(item.mime) && filePenalty(item.title) < 80) {
          pushCollected({
            url: item.url,
            remoteUrl: item.originalUrl || item.url,
            title: item.title,
            mime: item.mime,
            score: 220 + scoreImageRow(point, entry, item),
            source: 'wikidata-p18',
            pageTitle: entry.wikidataId,
            width: item.width,
            height: item.height,
          });
        }
      }

      if (commonsCategory) {
        const members = await commonsCategoryMembers(commonsCategory, 18);
        const infos = await commonsImageInfo(members.slice(0, 18));
        for (const item of infos) {
          if (!item?.url || !isAllowedMime(item.mime)) continue;
          const score = 40 + scoreImageRow(point, entry, item);
          if (score <= 10) continue;
          pushCollected({
            url: item.url,
            remoteUrl: item.originalUrl || item.url,
            title: item.title,
            mime: item.mime,
            score,
            source: 'commons-category',
            pageTitle: commonsCategory,
            width: item.width,
            height: item.height,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const searchQueries = buildSearchQueries(point, entry);

  for (const query of searchQueries.slice(0, 6)) {
    try {
      await sleep(Number(process.env.SEARCH_LOOP_MS || 1500));
      const fileTitles = await commonsSearchFiles(query, 8);
      const infos = await commonsImageInfo(fileTitles.slice(0, 8));
      for (const item of infos) {
        if (!item?.url || !isAllowedMime(item.mime)) continue;
        const score = 70 + scoreImageRow(point, entry, item);
        if (score <= 20) continue;
        pushCollected({
          url: item.url,
          remoteUrl: item.originalUrl || item.url,
          title: item.title,
          mime: item.mime,
          score,
          source: 'commons-search',
          pageTitle: query,
          width: item.width,
          height: item.height,
        });
      }
      if (collected.length >= MAX_IMAGES * 2) break;
    } catch {
      /* ignore */
    }
  }

  const pages = [];
  for (const lang of ['en', 'zh']) {
    for (const q of searchQueries.slice(0, 5)) {
      try {
        await sleep(Number(process.env.SEARCH_LOOP_MS || 1500));
        const results = await wikipediaSearch(lang, q);
        for (const row of results.slice(0, 2)) {
          pages.push({ lang, title: row.title, query: q });
        }
      } catch {
        /* ignore */
      }
    }
    if (pages.length >= 6) break;
  }

  const seenPage = new Set();
  for (const page of pages) {
    const pageKey = `${page.lang}:${page.title}`;
    if (seenPage.has(pageKey)) continue;
    seenPage.add(pageKey);

    let pageData;
    try {
      pageData = await wikipediaPageData(page.lang, page.title);
    } catch {
      continue;
    }
    if (!pageData) continue;

    const orig = pageData.original?.source;
    if (orig && /\.(jpe?g|png|webp)/i.test(orig) && !/\.svg/i.test(orig)) {
      pushCollected({
        url: wikimediaThumbUrl(orig),
        remoteUrl: orig,
        title: `${page.title} (pageimage)`,
        mime: orig.includes('.png') ? 'image/png' : 'image/jpeg',
        score: 150 + scoreTextMatch(page.title, buildNeedles(point, entry)),
        source: `${page.lang}.wikipedia.org`,
        pageTitle: page.title,
      });
    }

    const fileTitles = (pageData.images ?? [])
      .map((im) => im.title)
      .filter((title) => /^File:/i.test(title))
      .filter((title) => filePenalty(title) < 80)
      .slice(0, PAGE_IMAGE_LIMIT);

    const infos = await commonsImageInfo(fileTitles);
    for (const item of infos) {
      if (!isAllowedMime(item.mime)) continue;
      const score = scoreImageRow(point, entry, item);
      if (score <= 0) continue;
      pushCollected({
        url: item.url,
        remoteUrl: item.originalUrl || item.url,
        title: item.title,
        mime: item.mime,
        score,
        source: `${page.lang}.wikipedia.org:${page.title}`,
        pageTitle: page.title,
        width: item.width,
        height: item.height,
      });
    }

    if (collected.length >= MAX_IMAGES * 3) break;
  }

  return dedupe(collected).slice(0, MAX_IMAGES * 2);
}

function parseArgs(argv) {
  const args = { limit: null, offset: 0, replace: false, ids: null, shard: 0, shards: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--limit') {
      args.limit = Number(argv[i + 1] || 0) || null;
      i += 1;
    } else if (t === '--offset') {
      args.offset = Number(argv[i + 1] || 0) || 0;
      i += 1;
    } else if (t === '--replace') {
      args.replace = true;
    } else if (t === '--ids') {
      args.ids = new Set(String(argv[i + 1] || '').split(',').map((x) => x.trim()).filter(Boolean));
      i += 1;
    } else if (t === '--shard') {
      args.shard = Number(argv[i + 1] || 0) || 0;
      i += 1;
    } else if (t === '--shards') {
      args.shards = Math.max(1, Number(argv[i + 1] || 1) || 1);
      i += 1;
    }
  }
  if (args.shard < 0 || args.shard >= args.shards) {
    throw new Error(`--shard must be 0..${args.shards - 1}`);
  }
  return args;
}

function manifestPathForWorker(shard, shards) {
  if (shards <= 1) return MANIFEST_BASE;
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

function keepLocalImageMeta(image) {
  if (!image?.url || !/^\/images\/worldscene-candidates\//.test(image.url)) return false;
  if (!isImageUrl(image.url)) return false;
  return fs.existsSync(path.join(ROOT, 'public', image.url.replace(/^\//, '')));
}

function pruneManifestEntry(entry) {
  if (!entry?.images?.length) return entry;
  return {
    ...entry,
    images: entry.images.filter(keepLocalImageMeta),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const listedIds = parseExistingDestinationIds(fs.readFileSync(DATA_TS, 'utf8'));

  const bundle = JSON.parse(fs.readFileSync(CANDIDATE_JSON, 'utf8'));
  let entries = bundle.entries.filter((entry) => !listedIds.has(entry.id));
  if (args.ids?.size) entries = entries.filter((entry) => args.ids.has(entry.id));
  entries = entries.slice(args.offset, args.limit != null ? args.offset + args.limit : undefined);
  if (args.shards > 1) entries = entries.filter((_, idx) => idx % args.shards === args.shard);

  const manifestPath = manifestPathForWorker(args.shard, args.shards);
  const mainForSkip = loadJsonSafe(MANIFEST_BASE);
  const manifest = loadJsonSafe(manifestPath);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (args.shards > 1) {
    console.log(`Worker ${args.shard + 1}/${args.shards} -> ${path.relative(ROOT, manifestPath)} (${entries.length} entries)`);
  }

  let processed = 0;
  let skipped = 0;
  let misses = 0;

  for (const entry of entries) {
    if (manifest[entry.id]) {
      const pruned = pruneManifestEntry(manifest[entry.id]);
      if (pruned?.images?.length) manifest[entry.id] = pruned;
      else delete manifest[entry.id];
    }
    const existing = manifest[entry.id] || pruneManifestEntry(mainForSkip[entry.id]);
    const existingCount = existing?.images?.length ?? 0;
    if (!args.replace && existingCount >= MIN_IMAGES) {
      skipped += 1;
      continue;
    }

    console.log(`\n[candidate] ${entry.id} ${entry.name}`);
    let resolved;
    try {
      resolved = await resolveImagesForCandidate(entry);
    } catch (e) {
      console.warn('  resolve failed', e?.message || e);
      misses += 1;
      continue;
    }

    resolved = dedupe(resolved).slice(0, MAX_IMAGES);
    if (resolved.length === 0) {
      console.warn('  no images');
      misses += 1;
      continue;
    }

    const base = safeFileBase(entry.id);
    const metaOut = [];
    for (let i = 0; i < resolved.length; i += 1) {
      const image = resolved[i];
      const ext = extFromMime(image.mime, image.url);
      const fileName = `wcand-${base}-${i + 1}.${ext}`;
      const diskPath = path.join(OUT_DIR, fileName);

      try {
        if (!fs.existsSync(diskPath) || args.replace) {
          process.stdout.write(`  GET ${fileName} ... `);
          await downloadBinary(image.url, diskPath);
          const size = fs.statSync(diskPath).size;
          if (size < MIN_VALID_BYTES) {
            fs.rmSync(diskPath, { force: true });
            console.log(`skip small ${size}`);
            continue;
          }
          console.log(size);
        } else {
          console.log(`  skip existing ${fileName}`);
        }
      } catch (e) {
        console.log(`fail ${e?.message || e}`);
        continue;
      }

      metaOut.push({
        url: `/images/worldscene-candidates/${fileName}`,
        source: image.source,
        title: image.title,
        pageTitle: image.pageTitle,
        score: image.score,
        width: image.width,
        height: image.height,
        remoteUrl: image.remoteUrl || image.url,
      });
      if (metaOut.length >= MAX_IMAGES) break;
    }

    if (metaOut.length === 0) {
      misses += 1;
      continue;
    }

    manifest[entry.id] = {
      point: {
        name: entry.name,
        englishName: entry.englishName,
        country: entry.country,
        city: entry.city,
        lat: entry.lat,
        lng: entry.lng,
      },
      images: metaOut,
    };

    processed += 1;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');
    console.log(`  saved manifest (run +${processed})`);
    await sleep(INTER_ENTRY_DELAY_MS);
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`, 'utf8');

  const statusPath =
    args.shards > 1
      ? path.join(ROOT, 'data', 'worldscene', `candidate-poi-images-status.worker-${args.shard}-of-${args.shards}.json`)
      : path.join(ROOT, 'data', 'worldscene', 'candidate-poi-images-status.json');

  fs.writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        note: 'candidate image cache status; does not modify published poi-manifest',
        shard: args.shard,
        shards: args.shards,
        minImagesTarget: MIN_IMAGES,
        processedThisRun: processed,
        skippedAlreadyComplete: skipped,
        misses,
        manifestEntryCount: Object.keys(manifest).length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\nDone. processed=${processed} skipped(already ok)=${skipped} misses=${misses}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Wrote ${statusPath}`);
  if (args.shards > 1) {
    console.log('Merge when all workers finish: node scripts/merge-candidate-poi-manifests.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
