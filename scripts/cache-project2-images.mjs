/**
 * 将 src/lib/project2Data.ts 中的 upload.wikimedia.org 外链下载到 public/images/project2/
 * 并把源码里的 URL 替换为本地路径（/images/project2/...）。
 *
 * 用法: node scripts/cache-project2-images.mjs
 * 需可访问 upload.wikimedia.org；已存在同名文件则跳过下载。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src', 'lib', 'project2Data.ts');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'project2');

const UA = 'GameHistory/1.0 (image cache for local dev; educational use)';

function extFromUrl(url) {
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    const m = p.match(/\.(jpe?g|png|webp)$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* ignore */
  }
  return 'jpg';
}

function localName(url) {
  const ext = extFromUrl(url);
  const h = crypto.createHash('sha256').update(url).digest('hex').slice(0, 20);
  return `p2-${h}.${ext}`;
}

function collectUrls(text) {
  const re =
    /https:\/\/upload\.wikimedia\.org\/wikipedia\/commons(?:\/[A-Za-z0-9._%-]+)+\.(?:jpe?g|png|webp)/gi;
  const set = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    set.add(m[0]);
  }
  return [...set].sort((a, b) => b.length - a.length);
}

async function download(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  let text = fs.readFileSync(DATA_FILE, 'utf8');
  const urls = collectUrls(text);
  if (urls.length === 0) {
    console.log('No Wikimedia URLs found in project2Data.ts');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const map = new Map();
  for (const url of urls) {
    const name = localName(url);
    const diskPath = path.join(OUT_DIR, name);
    const webPath = `/images/project2/${name}`;

    if (!fs.existsSync(diskPath)) {
      process.stdout.write(`GET ${name} ... `);
      const buf = await download(url);
      fs.writeFileSync(diskPath, buf);
      console.log(`${buf.length} bytes`);
    } else {
      console.log(`SKIP (exists) ${name}`);
    }
    map.set(url, webPath);
  }

  let next = text;
  for (const [remote, local] of map) {
    const escaped = remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = next.replace(new RegExp(escaped, 'g'), local);
  }

  if (next !== text) {
    fs.writeFileSync(DATA_FILE, next, 'utf8');
    console.log(`Updated ${DATA_FILE} (${map.size} URL mappings)`);
  }

  const manifest = Object.fromEntries(map);
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Wrote manifest.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
