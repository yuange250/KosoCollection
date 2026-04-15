/**
 * 1) 校验 worldsceneData：中文「分类 category」与 wmCard(kind) 是否一致（图文口径一致）。
 * 2) 按与 pickStockGalleryUrls 相同算法拉取各景点用到的 Unsplash 图到 public/images/worldscene/stock-*.jpg
 * 3) 生成 src/lib/worldsceneStockCached.gen.ts，运行时空走 CDN。
 *
 * 用法: node scripts/cache-worldscene-unsplash.mjs
 * 可选: --force 在存在分类/kind 不一致时仍下载并写 gen 文件（默认发现不一致则退出码 1 且不下载）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const STOCK_TS = path.join(ROOT, 'src', 'lib', 'worldsceneStockPhotos.ts');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene');
const GEN_TS = path.join(ROOT, 'src', 'lib', 'worldsceneStockCached.gen.ts');

const UA = 'GameHistory/1.0 (worldscene unsplash cache; Unsplash License)';

const CATEGORY_TO_KIND = {
  人文古迹: 'heritage',
  自然景观: 'nature',
  城市地标: 'city',
  海岛度假: 'coast',
};

const Q = 'ixlib=rb-4.1.0&auto=format&fit=crop&w=1400&q=82';

function u(photoId) {
  return `https://images.unsplash.com/photo-${photoId}?${Q}`;
}

function extractWorking(ts) {
  const m = ts.match(/const WORKING = \[([\s\S]*?)\] as const\s*;/m);
  if (!m) throw new Error('const WORKING not found in worldsceneStockPhotos.ts');
  return [...m[1].matchAll(/'([0-9]+-[a-f0-9]+)'/g)].map((x) => x[1]);
}

function stockPoolUrls(working, phase) {
  return Array.from({ length: 24 }, (_, i) => u(working[(i + phase) % working.length]));
}

function hashId(pointId) {
  let h = 0;
  for (let i = 0; i < pointId.length; i += 1) {
    h = Math.imul(31, h) + pointId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickStockGalleryUrls(pointId, kind, count, pools) {
  const pool = pools[kind];
  const h = hashId(pointId);
  const out = [];
  const used = new Set();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    let idx = (h + i * 1_103_515_245) % pool.length;
    let guard = 0;
    while (used.has(idx) && guard < pool.length) {
      idx = (idx + 1) % pool.length;
      guard += 1;
    }
    used.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

function photoSlugFromUrl(url) {
  const m = url.match(/\/photo-([^?]+)/);
  return m ? m[1] : null;
}

function extFromContentType(ct) {
  if (!ct) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg')) return 'jpg';
  return 'jpg';
}

async function downloadToFile(url, diskPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url.slice(0, 80)}… → ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = extFromContentType(res.headers.get('content-type'));
  const finalPath = diskPath.replace(/\.(jpg|webp|png)$/i, `.${ext}`);
  fs.writeFileSync(finalPath, buf);
  return finalPath;
}

function parseDestinations(dataText) {
  const lines = dataText.split(/\r?\n/);
  const rows = [];
  let currentId = null;
  let currentCategory = null;

  for (const line of lines) {
    const idM = line.match(/^\s{4}id: '([^']+)',$/);
    if (idM) {
      currentId = idM[1];
      currentCategory = null;
      continue;
    }
    const catM = line.match(/^\s{4}category: '([^']+)',$/);
    if (catM) {
      currentCategory = catM[1];
      continue;
    }
    const imgM = line.match(/^\s{4}images: wmCard\('([^']+)',\s*'(heritage|nature|city|coast)'\),$/);
    if (imgM) {
      const pointId = imgM[1];
      const kind = imgM[2];
      rows.push({ pointId, kind, category: currentCategory, declaredId: currentId });
    }
  }
  return rows;
}

function checkConsistency(rows) {
  const issues = [];
  for (const r of rows) {
    if (r.declaredId !== r.pointId) {
      issues.push({
        level: 'error',
        msg: `wmCard 首参「${r.pointId}」与当前块 id「${r.declaredId}」不一致`,
        row: r,
      });
    }
    if (!r.category) {
      issues.push({ level: 'error', msg: `景点 ${r.pointId}：未解析到 category（顺序需在 images 之前）`, row: r });
      continue;
    }
    const expected = CATEGORY_TO_KIND[r.category];
    if (!expected) {
      issues.push({ level: 'error', msg: `未知 category「${r.category}」`, row: r });
      continue;
    }
    if (expected !== r.kind) {
      issues.push({
        level: 'warn',
        msg: `图文口径不一致：${r.pointId} 分类为「${r.category}」→ 期望配图 kind「${expected}」，当前 wmCard 为「${r.kind}」`,
        row: r,
      });
    }
  }
  return issues;
}

function formatGenTs(mapPointToPaths) {
  const keys = Object.keys(mapPointToPaths).sort();
  const lines = keys.map((k) => {
    const arr = mapPointToPaths[k];
    const inner = arr.map((p) => `'${p.replace(/'/g, "\\'")}'`).join(', ');
    return `  '${k.replace(/'/g, "\\'")}': [${inner}],`;
  });
  return `/**\n * 由 scripts/cache-worldscene-unsplash.mjs 生成 — 勿手改。重新生成：npm run cache:worldscene-unsplash\n */\nexport const PROJECT2_STOCK_LOCAL: Record<string, readonly string[]> = {\n${lines.join('\n')}\n};\n`;
}

async function main() {
  const force = process.argv.includes('--force');
  const dataText = fs.readFileSync(DATA_TS, 'utf8');
  const stockText = fs.readFileSync(STOCK_TS, 'utf8');

  const working = extractWorking(stockText);
  const pools = {
    heritage: stockPoolUrls(working, 0),
    nature: stockPoolUrls(working, 2),
    city: stockPoolUrls(working, 5),
    coast: stockPoolUrls(working, 8),
  };

  const rows = parseDestinations(dataText);
  const issues = checkConsistency(rows);
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  console.log(`— 作品二 图文一致性 — 共 ${rows.length} 条目的地配图声明`);
  if (errors.length) {
    for (const e of errors) console.error('[错误]', e.msg);
    console.error('存在解析或 id 错误，已中止（不可用 --force 跳过）。');
    process.exit(1);
  }
  if (warns.length) {
    for (const w of warns) console.warn('[不一致]', w.msg);
    if (!force) {
      console.error('存在「分类 category」与 wmCard(kind) 不一致，已中止。确认有意为之请加 --force。');
      process.exit(1);
    }
    console.warn('已加 --force：仍写入缓存与 gen 文件。');
  }
  if (!warns.length) {
    console.log('分类 category 与 wmCard(kind) 全部一致。');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const urlToWebPath = new Map();
  const pointToPaths = {};

  function findExistingStockDisk(slug) {
    if (!fs.existsSync(OUT_DIR)) return null;
    const hit = fs.readdirSync(OUT_DIR).find((f) => f.startsWith(`stock-${slug}.`));
    return hit ? path.join(OUT_DIR, hit) : null;
  }

  for (const r of rows) {
    const urls = pickStockGalleryUrls(r.pointId, r.kind, 3, pools);
    const locals = [];
    for (const url of urls) {
      const slug = photoSlugFromUrl(url);
      if (!slug) throw new Error(`无法解析 photo slug: ${url}`);

      if (!urlToWebPath.has(url)) {
        const existingDisk = findExistingStockDisk(slug);
        if (existingDisk) {
          const base = path.basename(existingDisk);
          console.log(`SKIP ${base}`);
          urlToWebPath.set(url, `/images/worldscene/${base}`);
        } else {
          process.stdout.write(`GET stock-${slug} … `);
          const written = await downloadToFile(url, path.join(OUT_DIR, `stock-${slug}.jpg`));
          const base = path.basename(written);
          console.log(`${fs.statSync(written).size} bytes → ${base}`);
          urlToWebPath.set(url, `/images/worldscene/${base}`);
        }
      }
      locals.push(urlToWebPath.get(url));
    }
    pointToPaths[r.pointId] = locals;
  }

  fs.writeFileSync(GEN_TS, formatGenTs(pointToPaths), 'utf8');
  console.log(`Wrote ${GEN_TS}`);
  console.log(`Cached under ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

