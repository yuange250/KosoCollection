/**
 * 仅为「未上架候补」景点缓存配图：写入 public/images/worldscene-candidates/ 与
 * data/worldscene/candidate-poi-manifest.json。
 *
 * 绝不修改：worldsceneData.ts、poi-manifest.json、worldscenePoiCatalog.gen.ts、
 * worldscenePoiCached.gen.ts、public/images/worldscene/poi-*（已上架专用）。
 *
 * 策略：Wikidata P18（若有）→ en/zh 维基百科页面图片 + Commons 元数据，取分最高的若干张。
 *
 *   node scripts/cache-candidate-poi-images.mjs
 *   node scripts/cache-candidate-poi-images.mjs --limit 50
 *   node scripts/cache-candidate-poi-images.mjs --offset 500 --limit 200
 *   node scripts/cache-candidate-poi-images.mjs --replace
 *   node scripts/cache-candidate-poi-images.mjs --ids id1,id2
 *
 * 多进程（同 IP 并发易 429，建议 1～2；4 路仅在网络很稳时试）：
 *   node scripts/cache-candidate-poi-images.mjs --shard 0 --shards 2
 *   node scripts/run-candidate-poi-images-parallel.mjs 2
 *   完成后：node scripts/merge-candidate-poi-manifests.mjs
 *
 * 环境变量：MIN_IMAGES MAX_IMAGES DOWNLOAD_DELAY_MS INTER_ENTRY_DELAY_MS API_GAP_MS
 *   SEARCH_LOOP_MS COMMONS_BATCH PAGE_IMAGE_LIMIT DOWNLOAD_RETRIES
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

const MIN_IMAGES = Math.max(1, Number(process.env.MIN_IMAGES || 5));
const MAX_IMAGES = Math.min(12, Math.max(MIN_IMAGES, Number(process.env.MAX_IMAGES || 6)));
/** 单张图下载成功后的间隔（upload.wikimedia.org 易 429，默认偏保守） */
const DOWNLOAD_DELAY_MS = Number(process.env.DOWNLOAD_DELAY_MS || 12000);
/** 两个候补景点之间的间隔 */
const INTER_ENTRY_DELAY_MS = Number(process.env.INTER_ENTRY_DELAY_MS || 22000);
/** 任意维基 / Wikidata / Commons API 请求之间的最小间隔 */
const API_GAP_MS = Number(process.env.API_GAP_MS || 1200);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastApiAt = 0;
async function throttleApi() {
  const gap = API_GAP_MS;
  const now = Date.now();
  const wait = Math.max(0, gap - (now - lastApiAt));
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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
  const bad = ['map', 'locator', 'plan', 'logo', 'flag', 'symbol', 'crest', 'coat of arms', 'route', 'icon', 'disambiguation', 'svg', 'banner', 'seal'];
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
  for (let i = 0; i < fileTitles.length; i += batch) {
    chunks.push(fileTitles.slice(i, i + batch));
  }
  const out = [];
  for (let c = 0; c < chunks.length; c += 1) {
    if (c > 0) await sleep(API_GAP_MS);
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('prop', 'imageinfo|categories');
    url.searchParams.set('iiprop', 'url|mime|timestamp|size');
    url.searchParams.set('cllimit', '12');
    url.searchParams.set('titles', chunks[c].join('|'));
    url.searchParams.set('origin', '*');
    const data = await fetchJson(url.toString());
    const batchRows = Object.values(data?.query?.pages ?? {})
      .map((page) => {
        const title = page?.title;
        const info = page?.imageinfo?.[0];
        if (!title || !info?.url) return null;
        const categories = (page?.categories ?? []).map((c) => String(c.title || '').replace(/^Category:/i, ''));
        return {
          title,
          url: info.url,
          mime: info.mime || '',
          timestamp: info.timestamp || null,
          width: Number(info.width) || undefined,
          height: Number(info.height) || undefined,
          description: '',
          categories,
        };
      })
      .filter(Boolean);
    out.push(...batchRows);
  }
  return out;
}

function parseP18Filename(entity) {
  const claims = entity?.claims?.P18;
  if (!claims?.length) return null;
  const v = claims[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' ? v : null;
}

async function fetchWikidataForImages(qid) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', qid);
  url.searchParams.set('props', 'claims');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  const ent = data.entities?.[qid];
  if (!ent || ent.missing) return { p18File: null };
  const fn = parseP18Filename(ent);
  return { p18File: fn };
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

function buildNeedles(point) {
  return uniq([point.name, point.englishName, point.city, point.country, ...(point.aliases || [])]);
}

function scoreImageRow(point, item) {
  const needles = buildNeedles(point);
  const blob = `${item.title} ${item.description} ${(item.categories || []).join(' ')}`;
  return (
    scoreTextMatch(item.title, needles) * 2 +
    scoreTextMatch(blob, needles) -
    filePenalty(item.title) -
    qualityPenalty(item.width, item.height) +
    qualityBonus(item.width, item.height)
  );
}

async function resolveImagesForCandidate(entry) {
  const point = candidateToPoint(entry);
  const needles = buildNeedles(point);
  const collected = [];
  const seenUrl = new Set();

  if (entry.wikidataId) {
    try {
      const { p18File } = await fetchWikidataForImages(entry.wikidataId);
      if (p18File) {
        const fileTitle = p18File.startsWith('File:') ? p18File : `File:${p18File}`;
        const infos = await commonsImageInfo([fileTitle]);
        for (const item of infos) {
          const key = canonicalImageKey(item.url);
          if (!key || seenUrl.has(key) || !isAllowedMime(item.mime)) continue;
          seenUrl.add(key);
          collected.push({
            url: item.url,
            remoteUrl: item.url,
            title: item.title,
            mime: item.mime,
            score: 200 + scoreImageRow(point, item),
            source: 'wikidata-p18',
            pageTitle: entry.wikidataId,
            width: item.width,
            height: item.height,
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const searchQueries = uniq([
    `${point.englishName} ${point.country !== '—' ? point.country : ''}`,
    `${point.name} ${point.country !== '—' ? point.country : ''}`,
    point.englishName,
    point.name,
  ]).filter((q) => q && q.length > 2);

  const pages = [];
  for (const lang of ['en', 'zh']) {
    for (const q of searchQueries.slice(0, 4)) {
      try {
        await sleep(Number(process.env.SEARCH_LOOP_MS || 1500));
        const results = await wikipediaSearch(lang, q);
        for (const r of results.slice(0, 2)) {
          pages.push({ lang, title: r.title, q });
        }
      } catch {
        /* */
      }
    }
    if (pages.length >= 6) break;
  }

  const seenPage = new Set();
  for (const p of pages) {
    const key = `${p.lang}:${p.title}`;
    if (seenPage.has(key)) continue;
    seenPage.add(key);
    let pageData;
    try {
      pageData = await wikipediaPageData(p.lang, p.title);
    } catch {
      continue;
    }
    if (!pageData) continue;

    const orig = pageData.original?.source;
    if (orig && /\.(jpe?g|png|webp)/i.test(orig) && !/\.svg/i.test(orig)) {
      const ok = canonicalImageKey(orig);
      if (ok && !seenUrl.has(ok)) {
        seenUrl.add(ok);
        collected.push({
          url: orig,
          remoteUrl: orig,
          title: `${p.title} (pageimage)`,
          mime: orig.includes('.png') ? 'image/png' : 'image/jpeg',
          score: 150 + scoreTextMatch(p.title, needles),
          source: `${p.lang}.wikipedia.org`,
          pageTitle: p.title,
        });
      }
    }

    const fileTitles = (pageData.images ?? [])
      .map((im) => im.title)
      .filter((t) => /^File:/i.test(t))
      .filter((t) => filePenalty(t) < 80)
      .slice(0, PAGE_IMAGE_LIMIT);

    const infos = await commonsImageInfo(fileTitles);
    for (const item of infos) {
      const k = canonicalImageKey(item.url);
      if (!k || seenUrl.has(k) || !isAllowedMime(item.mime)) continue;
      const sc = scoreImageRow(point, item);
      if (sc <= 0) continue;
      seenUrl.add(k);
      collected.push({
        url: item.url,
        remoteUrl: item.url,
        title: item.title,
        mime: item.mime,
        score: sc,
        source: `${p.lang}.wikipedia.org:${p.title}`,
        pageTitle: p.title,
        width: item.width,
        height: item.height,
      });
    }
    if (collected.length >= MAX_IMAGES * 3) break;
  }

  collected.sort((a, b) => (b.score || 0) - (a.score || 0));
  return collected.slice(0, MAX_IMAGES * 2);
}

function dedupe(images) {
  const m = new Map();
  for (const im of images) {
    const k = canonicalImageKey(im.remoteUrl || im.url);
    if (!k) continue;
    const prev = m.get(k);
    if (!prev || (im.score || 0) > (prev.score || 0)) m.set(k, im);
  }
  return [...m.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function safeFileBase(id) {
  let s = String(id).replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length > 100) s = s.slice(0, 100);
  return s || 'poi';
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
      args.ids = new Set(
        String(argv[i + 1] || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      );
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

function loadJsonSafe(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ts = fs.readFileSync(DATA_TS, 'utf8');
  const listedIds = parseExistingDestinationIds(ts);

  const bundle = JSON.parse(fs.readFileSync(CANDIDATE_JSON, 'utf8'));
  let entries = bundle.entries.filter((e) => !listedIds.has(e.id));
  if (args.ids?.size) entries = entries.filter((e) => args.ids.has(e.id));

  entries = entries.slice(args.offset, args.limit != null ? args.offset + args.limit : undefined);

  if (args.shards > 1) {
    entries = entries.filter((_, idx) => idx % args.shards === args.shard);
  }

  const MANIFEST_PATH = manifestPathForWorker(args.shard, args.shards);
  const mainForSkip = loadJsonSafe(MANIFEST_BASE);

  let manifest = loadJsonSafe(MANIFEST_PATH);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (args.shards > 1) {
    console.log(`Worker ${args.shard + 1}/${args.shards} → ${path.relative(ROOT, MANIFEST_PATH)} (${entries.length} entries)`);
  }

  let processed = 0;
  let skipped = 0;
  let misses = 0;

  for (const entry of entries) {
    const existing = manifest[entry.id] || mainForSkip[entry.id];
    const nExisting = existing?.images?.length ?? 0;
    if (!args.replace && nExisting >= MIN_IMAGES) {
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
      const img = resolved[i];
      const ext = extFromMime(img.mime, img.url);
      const fname = `wcand-${base}-${i + 1}.${ext}`;
      const diskPath = path.join(OUT_DIR, fname);
      try {
        if (!fs.existsSync(diskPath) || args.replace) {
          process.stdout.write(`  GET ${fname} ... `);
          await downloadBinary(img.url, diskPath);
          const sz = fs.statSync(diskPath).size;
          if (sz < MIN_VALID_BYTES) {
            fs.rmSync(diskPath, { force: true });
            console.log(`skip small ${sz}`);
            continue;
          }
          console.log(sz);
        } else {
          console.log(`  skip existing ${fname}`);
        }
      } catch (e) {
        console.log(`fail ${e?.message || e}`);
        continue;
      }

      const localUrl = `/images/worldscene-candidates/${fname}`;
      metaOut.push({
        url: localUrl,
        source: img.source,
        title: img.title,
        pageTitle: img.pageTitle,
        score: img.score,
        width: img.width,
        height: img.height,
        remoteUrl: img.remoteUrl || img.url,
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
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`, 'utf8');
    console.log(`  saved manifest (run +${processed})`);
    await sleep(INTER_ENTRY_DELAY_MS);
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`, 'utf8');
  const statusPath =
    args.shards > 1
      ? path.join(ROOT, 'data', 'worldscene', `candidate-poi-images-status.worker-${args.shard}-of-${args.shards}.json`)
      : path.join(ROOT, 'data', 'worldscene', 'candidate-poi-images-status.json');
  fs.writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        note: '候补配图缓存状态；不修改已上架 poi-manifest',
        shard: args.shard,
        shards: args.shards,
        minImagesTarget: MIN_IMAGES,
        processedThisRun: processed,
        skippedAlreadyComplete: skipped,
        misses: misses,
        manifestEntryCount: Object.keys(manifest).length,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`\nDone. processed=${processed} skipped(already ok)=${skipped} misses=${misses}`);
  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log(`Wrote ${statusPath}`);
  if (args.shards > 1) {
    console.log('Merge when all workers finish: node scripts/merge-candidate-poi-manifests.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
