/**
 * 把节点里 http(s) 外链图下载到 public/images/nodes/，并改写 JSON 中的 imageUrl 为站内路径，
 * 避免用户打开页面时大量请求外站、占出口带宽。
 *
 * 用法：
 *   node scripts/cache-node-images.mjs
 *   node scripts/cache-node-images.mjs public/data/nodes.json public/data/nodes-bulk.json
 *   DRY_RUN=1 node scripts/cache-node-images.mjs
 *   SKIP_EXISTING=1 node scripts/cache-node-images.mjs   # 已存在同名文件则跳过下载
 *
 * 相同 URL 只落盘一次（按 URL 的 SHA256 前 16 位命名）。
 */

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const UA = 'KosoWorld/1.0 (cache-images; local mirror) Node.js';

const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const SKIP_EXISTING = process.env.SKIP_EXISTING === '1' || process.env.SKIP_EXISTING === 'true';
const SLEEP_MS = Math.max(0, parseInt(process.env.SLEEP_MS || '80', 10) || 80);
const CONCURRENCY = Math.max(1, Math.min(20, parseInt(process.env.CACHE_CONCURRENCY || '8', 10) || 8));

const OUT_DIR = join(root, 'public', 'images', 'nodes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extFromContentType(ct) {
  if (!ct) return null;
  const c = ct.split(';')[0].trim().toLowerCase();
  if (c.includes('svg')) return 'svg';
  if (c.includes('webp')) return 'webp';
  if (c.includes('png')) return 'png';
  if (c.includes('jpeg')) return 'jpg';
  if (c === 'image/jpg') return 'jpg';
  if (c.includes('gif')) return 'gif';
  if (c.includes('image/jpg') || c.endsWith('/jpeg')) return 'jpg';
  return null;
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/\.(png|jpe?g|webp|gif|svg)(?:$|[?#])/i);
    if (!m) return null;
    return m[1].toLowerCase().replace(/^jpeg$/, 'jpg');
  } catch {
    return null;
  }
}

function urlFingerprint(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function isRemoteUrl(s) {
  return /^https?:\/\//i.test(s);
}

function pickExt(ct, url) {
  return extFromContentType(ct) || extFromUrl(url) || 'jpg';
}

function existingFileForId(id) {
  if (!existsSync(OUT_DIR)) return null;
  for (const name of readdirSync(OUT_DIR)) {
    if (name.startsWith(`${id}.`)) return join(OUT_DIR, name);
  }
  return null;
}

async function downloadToDisk(url, id) {
  mkdirSync(OUT_DIR, { recursive: true });

  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const ct = res.headers.get('content-type');
  const ext = pickExt(ct, url);
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = join(OUT_DIR, `${id}.${ext}`);
  writeFileSync(outPath, buf);
  return outPath;
}

function collectRemoteUrls(nodes) {
  const set = new Set();
  if (!Array.isArray(nodes)) return set;
  for (const n of nodes) {
    const u = n?.content?.imageUrl;
    if (typeof u !== 'string' || !u) continue;
    if (!isRemoteUrl(u)) continue;
    try {
      const p = new URL(u).pathname;
      if (p.includes('placeholders')) continue;
    } catch {
      continue;
    }
    set.add(u);
  }
  return set;
}

function rewriteNodes(nodes, urlToLocal) {
  if (!Array.isArray(nodes)) return 0;
  let n = 0;
  for (const node of nodes) {
    const u = node?.content?.imageUrl;
    if (typeof u !== 'string' || !isRemoteUrl(u)) continue;
    const local = urlToLocal.get(u);
    if (local) {
      node.content.imageUrl = local;
      n++;
    }
  }
  return n;
}

async function ensureUrlCached(url, urlToLocal) {
  if (urlToLocal.has(url)) return;

  const id = urlFingerprint(url);

  if (SKIP_EXISTING && !DRY) {
    const hit = existingFileForId(id);
    if (hit) {
      urlToLocal.set(url, `/images/nodes/${basename(hit)}`);
      return;
    }
  }

  if (DRY) {
    const ext = extFromUrl(url) || 'jpg';
    urlToLocal.set(url, `/images/nodes/${id}.${ext}`);
    console.log('[dry-run]', url.slice(0, 72) + (url.length > 72 ? '…' : ''));
    return;
  }

  const hit = existingFileForId(id);
  if (hit) {
    urlToLocal.set(url, `/images/nodes/${basename(hit)}`);
    return;
  }

  const out = await downloadToDisk(url, id);
  urlToLocal.set(url, `/images/nodes/${basename(out)}`);
  console.log('已缓存', basename(out), '←', url.slice(0, 56) + (url.length > 56 ? '…' : ''));
}

async function processFile(filePath) {
  if (!existsSync(filePath)) {
    console.warn('跳过（不存在）', filePath);
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  let nodes;
  try {
    nodes = JSON.parse(raw);
  } catch (e) {
    console.error('JSON 解析失败', filePath, e.message);
    return;
  }

  if (!Array.isArray(nodes)) {
    console.warn('跳过（非数组）', filePath);
    return;
  }

  const urls = [...collectRemoteUrls(nodes)];
  if (!urls.length) {
    console.log(basename(filePath), '无外链图，跳过');
    return;
  }

  console.log(basename(filePath), '待缓存外链', urls.length, '个（去重）');

  const urlToLocal = new Map();

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (url) => {
        try {
          await ensureUrlCached(url, urlToLocal);
        } catch (e) {
          console.warn('下载失败', url.slice(0, 80), e.message);
        }
      }),
    );
    await sleep(SLEEP_MS);
    if ((i / CONCURRENCY + 1) % 10 === 0) {
      console.log(basename(filePath), '缓存进度', Math.min(i + CONCURRENCY, urls.length), '/', urls.length);
    }
  }

  const changed = rewriteNodes(nodes, urlToLocal);
  console.log(basename(filePath), '将改写节点', changed, '条');

  if (DRY) {
    console.log('DRY_RUN=1，未写入', filePath);
    return;
  }

  const bak = filePath + '.bak';
  copyFileSync(filePath, bak);
  writeFileSync(filePath, JSON.stringify(nodes, null, 2) + '\n', 'utf8');
  console.log('已备份', bak, '已写入', filePath);
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const files =
    args.length > 0
      ? args.map((a) => (a.startsWith('/') || /^[A-Za-z]:/.test(a) ? a : join(root, a)))
      : [join(root, 'public', 'data', 'nodes.json')];

  console.log('输出目录', OUT_DIR);
  for (const f of files) {
    await processFile(f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
