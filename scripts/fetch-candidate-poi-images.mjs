/**
 * 为候补景点（data/worldscene/candidate-pois.json）拉取配图并缓存到本地。
 * 来源：Wikidata P18（主图）+ Wikimedia Commons 文件搜索（namespace=File）。
 * 与已上架 poi-* 目录隔离：写入 public/images/worldscene/candidates/
 * 元数据：data/worldscene/candidate-poi-image-manifest.json
 *
 *   node scripts/fetch-candidate-poi-images.mjs
 *   node scripts/fetch-candidate-poi-images.mjs --limit 50
 *   node scripts/fetch-candidate-poi-images.mjs --ids ephesus,kinkaku-ji
 *   DRY_RUN=1 只打印不下载
 *
 * 环境变量：SLEEP_MS（默认 400）、MAX_PER_POI（默认 5）、MIN_SHORT_EDGE（默认 420）
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CANDIDATE_JSON = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene', 'candidates');
const MANIFEST_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-image-manifest.json');

const UA = 'KosoCollection-candidate-images/1.0 (Wikimedia Commons; educational)';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

async function fetchJson(url, init = {}, retries = 2) {
  let last;
  for (let a = 0; a < retries; a += 1) {
    try {
      const merged = {
        ...init,
        headers: { 'User-Agent': UA, ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(42000),
      };
      const r = await fetch(url, merged);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(900 * (a + 1));
    }
  }
  throw last;
}

const RANK_ORDER = { preferred: 0, normal: 1, deprecated: 9 };

function parseArgs(argv) {
  const out = { limit: null, ids: null, dry: process.env.DRY_RUN === '1' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit') {
      out.limit = Number(argv[i + 1]) || null;
      i += 1;
    } else if (argv[i] === '--ids') {
      out.ids = new Set(
        String(argv[i + 1] || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fileBaseFromId(id) {
  const safe = String(id).replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (safe.length <= 96) return safe;
  return `h${crypto.createHash('sha256').update(id).digest('hex').slice(0, 28)}`;
}

function parseP18(entity) {
  const claims = entity?.claims?.P18;
  if (!claims?.length) return null;
  const sorted = [...claims].sort((a, b) => (RANK_ORDER[a.rank] ?? 5) - (RANK_ORDER[b.rank] ?? 5));
  for (const claim of sorted) {
    if (claim.rank === 'deprecated') continue;
    const v = claim?.mainsnak?.datavalue?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function wikidataEntities(ids) {
  const url = new URL(WIKIDATA_API);
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', ids.join('|'));
  url.searchParams.set('props', 'claims');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  if (data.error) throw new Error(data.error?.info || 'wikidata error');
  return data.entities ?? {};
}

async function commonsImageInfo(fileTitle) {
  const title = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', title);
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|size|mime');
  url.searchParams.set('iiurlwidth', '2048');
  const data = await fetchJson(url.toString());
  const pages = data.query?.pages;
  if (!pages) return null;
  const p = Object.values(pages)[0];
  if (p?.missing) return null;
  const ii = p?.imageinfo?.[0];
  if (!ii?.url) return null;
  const w = ii.thumbwidth || ii.width;
  const h = ii.thumbheight || ii.height;
  return {
    url: ii.thumburl || ii.url,
    fullUrl: ii.url,
    width: w,
    height: h,
    mime: ii.mime,
    title: p.title || title,
  };
}

async function commonsSearchFiles(query, limit = 12) {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srnamespace', '6');
  url.searchParams.set('srlimit', String(limit));
  url.searchParams.set('format', 'json');
  const data = await fetchJson(url.toString());
  return data.query?.search?.map((s) => s.title) ?? [];
}

async function downloadToFile(remoteUrl, destPath) {
  const r = await fetch(remoteUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 8000) throw new Error('too small');
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('image') && !ct.includes('octet-stream')) throw new Error(`bad type ${ct}`);
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

function extFromMime(mime) {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { schemaVersion: 1, updatedAt: null, entries: {} };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`, 'utf8');
}

function searchQueriesForEntry(entry) {
  const country = entry.country && entry.country !== '—' ? entry.country : '';
  const city = entry.city && entry.city !== '—' ? entry.city : '';
  const en = String(entry.englishName || '').trim();
  const zh = String(entry.name || '').trim();
  const shortEn = en.split(/[,(]/)[0]?.trim() || en;
  const clipped = en.length > 90 ? `${en.slice(0, 88).trim()}…` : en;

  const out = [];
  const push = (q) => {
    const s = String(q || '').trim();
    if (s.length >= 4 && !out.includes(s)) out.push(s);
  };

  push(`${shortEn} ${country}`.trim());
  push(`${clipped} ${country}`.trim());
  push(`${en} ${city} ${country}`.trim());
  if (zh && zh !== en) push(`${zh} ${country}`.trim());
  push(shortEn);
  return out;
}

async function collectTitlesForEntry(entry) {
  const titles = [];
  const seen = new Set();

  /** 先 Commons 关键词（比 Wikidata P18 更贴景点图；部分条目 P18 可能指向错误文件） */
  const queries = searchQueriesForEntry(entry);
  for (const q of queries) {
    if (titles.length >= 18) break;
    try {
      const found = await commonsSearchFiles(q, 12);
      for (const t of found) {
        if (!seen.has(t)) {
          seen.add(t);
          titles.push(t);
        }
      }
      if (found.length > 0) break;
    } catch {
      /* try next query */
    }
  }

  if (entry.wikidataId && titles.length < 8) {
    try {
      const ents = await wikidataEntities([entry.wikidataId]);
      const ent = ents[entry.wikidataId];
      if (ent && !ent.missing) {
        const p18 = parseP18(ent);
        if (p18) {
          const t = p18.includes('File:') ? p18 : `File:${p18}`;
          if (!seen.has(t)) {
            seen.add(t);
            titles.push(t);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return titles;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const SLEEP_MS = Number(process.env.SLEEP_MS || 400);
  const MAX_PER_POI = Number(process.env.MAX_PER_POI || 5);
  const MIN_SHORT_EDGE = Number(process.env.MIN_SHORT_EDGE || 420);

  const raw = fs.readFileSync(CANDIDATE_JSON, 'utf8');
  const bundle = JSON.parse(raw);
  let list = bundle.entries.filter((e) => e.lat != null && e.lng != null && !Number.isNaN(+e.lat) && !Number.isNaN(+e.lng));
  if (args.ids?.size) list = list.filter((e) => args.ids.has(e.id));
  if (args.limit && args.limit > 0) list = list.slice(0, args.limit);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const manifest = loadManifest();
  if (!manifest.entries) manifest.entries = {};

  let processed = 0;
  let imagesWritten = 0;
  let skipped = 0;

  console.log('candidates to process', list.length, args.dry ? '(DRY_RUN)' : '');

  for (const entry of list) {
    const existing = manifest.entries[entry.id]?.images?.length ?? 0;
    if (existing >= MAX_PER_POI) {
      skipped += 1;
      continue;
    }

    const need = MAX_PER_POI - existing;
    const base = fileBaseFromId(entry.id);
    const collected = [];
    let titles = [];
    try {
      titles = await collectTitlesForEntry(entry);
    } catch (e) {
      console.warn('collect failed', entry.id, e.message);
    }
    if (titles.length === 0) {
      console.log('SKIP no image titles', entry.id, String(entry.englishName).slice(0, 72));
    }
    await sleep(SLEEP_MS);

    let slot = existing;
    for (const title of titles) {
      if (collected.length >= need) break;
      let info;
      try {
        info = await commonsImageInfo(title);
        await sleep(SLEEP_MS);
      } catch {
        continue;
      }
      if (!info?.url) continue;
      const shortEdge = Math.min(info.width || 0, info.height || 0);
      if (shortEdge > 0 && shortEdge < MIN_SHORT_EDGE) continue;

      slot += 1;
      const ext = extFromMime(info.mime);
      const localName = `${base}-${slot}.${ext}`;
      const diskPath = path.join(OUT_DIR, localName);
      const publicUrl = `/images/worldscene/candidates/${localName}`;

      if (!args.dry) {
        try {
          await downloadToFile(info.url, diskPath);
        } catch (e) {
          console.warn('download fail', entry.id, title, e.message);
          slot -= 1;
          continue;
        }
      }

      collected.push({
        url: publicUrl,
        remoteUrl: info.fullUrl || info.url,
        source: 'wikimedia-commons',
        title: info.title?.replace(/^File:/, '') || title,
        score: Math.round((info.width || 0) * (info.height || 0) / 10000),
        width: info.width,
        height: info.height,
      });
      imagesWritten += 1;
      console.log('ok', entry.id, localName, info.width, 'x', info.height);
    }

    if (collected.length > 0) {
      const prev = manifest.entries[entry.id]?.images ?? [];
      manifest.entries[entry.id] = {
        point: {
          name: entry.name,
          englishName: entry.englishName,
          country: entry.country,
          city: entry.city,
          lat: entry.lat,
          lng: entry.lng,
        },
        images: [...prev, ...collected].slice(0, MAX_PER_POI),
      };
      processed += 1;
      saveManifest(manifest);
    }
  }

  manifest.fetchStats = {
    at: new Date().toISOString(),
    processedEntries: processed,
    imagesWritten,
    skippedAlreadyFull: skipped,
    dryRun: args.dry,
  };
  saveManifest(manifest);

  console.log('done. entries updated', processed, 'images new', imagesWritten, 'skipped full', skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
