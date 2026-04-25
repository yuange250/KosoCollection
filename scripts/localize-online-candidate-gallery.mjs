import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/codes/KosoCollection';
const DATA_PATH = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const GALLERY_PATH = path.join(ROOT, 'src', 'lib', 'worldsceneCandidateGallery.ts');
const MANIFEST_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene-candidates');

const USER_AGENT = 'KosoCollection/1.0 (online candidate gallery localizer)';
const REQUEST_TIMEOUT_MS = 120000;
const MIN_VALID_BYTES = 35 * 1024;
const MAX_COUNT = Math.max(1, Number(process.argv[2] || 40));
const ONLY_IDS = new Set(
  String(process.env.ONLY_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.includes('.png')) return 'png';
  if (lower.includes('.webp')) return 'webp';
  return 'jpg';
}

function wikimediaThumbUrl(url, width = 1280) {
  const raw = String(url || '');
  if (!/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//i.test(raw)) return raw;
  if (raw.includes('/thumb/')) return raw;

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname;
    const marker = '/wikipedia/commons/';
    const index = pathname.indexOf(marker);
    if (index === -1) return raw;
    const rest = pathname.slice(index + marker.length);
    const fileName = rest.split('/').pop();
    if (!fileName) return raw;
    parsed.pathname = `${marker}thumb/${rest}/${width}px-${fileName}`;
    return parsed.toString();
  } catch {
    return raw;
  }
}

function safeBase(id) {
  return String(id)
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

async function download(url, outFile) {
  const attempts = 6;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KosoCollection/1.0',
          Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: 'http://127.0.0.1:5173/works/worldscene',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number.parseInt(res.headers.get('retry-after') || '', 10);
        const waitMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : Math.min(90000, 4000 * 2 ** attempt);
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        throw new Error(`http ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < MIN_VALID_BYTES) {
        throw new Error(`too-small ${buf.length}`);
      }
      fs.writeFileSync(outFile, buf);
      return;
    } catch (error) {
      lastError = error;
      if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
      if (attempt < attempts - 1) {
        await sleep(Math.min(60000, 2000 * 2 ** attempt));
      }
    }
  }
  throw lastError ?? new Error('download-failed');
}

const dataText = fs.readFileSync(DATA_PATH, 'utf8');
const galleryText = fs.readFileSync(GALLERY_PATH, 'utf8');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const onlineIds = new Set([...dataText.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));

const entryRegex = /["']([^"']+)["']:\s*\{\s*images:\s*\[\s*\{\s*url:\s*["']([^"']+)["']/g;
const targets = [];
for (const match of galleryText.matchAll(entryRegex)) {
  const [, id, url] = match;
  if (!onlineIds.has(id)) continue;
  if (ONLY_IDS.size > 0 && !ONLY_IDS.has(id)) continue;
  if (!/^https?:\/\//.test(url)) continue;
  targets.push({ id, url });
}

targets.sort((a, b) => a.id.localeCompare(b.id));
const picked = targets.slice(0, MAX_COUNT);
if (picked.length === 0) {
  console.log(JSON.stringify({ localized: 0, note: 'no matching remote online candidate images found' }, null, 2));
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let nextText = galleryText;
const localized = [];

for (let i = 0; i < picked.length; i += 1) {
  const item = picked[i];
  const manifestImages = Array.isArray(manifest[item.id]?.images) ? manifest[item.id].images : [];
  const remoteSources = [
    ...manifestImages.flatMap((image) => [image?.remoteUrl, image?.url]),
    item.url,
  ]
    .flatMap((url) => [wikimediaThumbUrl(url), url])
    .filter((url, index, urls) => /^https?:\/\//.test(url || '') && urls.indexOf(url) === index);
  const existingLocalUrls = manifestImages
    .map((image) => image?.url)
    .filter((url) => /^\/images\/worldscene-candidates\//.test(url || ''));
  const ext = extFromUrl(remoteSources[0] || item.url);
  const fileName = `wcand-${safeBase(item.id)}-1.${ext}`;
  const relUrl = `/images/worldscene-candidates/${fileName}`;
  const diskPath = path.join(OUT_DIR, fileName);

  process.stdout.write(`[${i + 1}/${picked.length}] ${item.id} ... `);
  try {
    for (const existingLocalUrl of existingLocalUrls) {
      const existingLocalPath = path.join(ROOT, 'public', existingLocalUrl.replace(/^\//, '').replace(/\//g, path.sep));
      if (fs.existsSync(existingLocalPath) && existingLocalPath !== diskPath) {
        fs.copyFileSync(existingLocalPath, diskPath);
        break;
      }
    }
    if (!fs.existsSync(diskPath)) {
      let downloaded = false;
      let lastDownloadError = null;
      for (const sourceUrl of remoteSources) {
        try {
          await download(sourceUrl, diskPath);
          downloaded = true;
          break;
        } catch (error) {
          lastDownloadError = error;
        }
      }
      if (!downloaded) {
        throw lastDownloadError ?? new Error('download-failed');
      }
      await sleep(300);
    }
    const escapedId = item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedUrl = item.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`((['"])${escapedId}\\2:\\s*\\{[\\s\\S]*?url:\\s*)(['"])${escapedUrl}\\3`);
    if (!pattern.test(nextText)) {
      throw new Error('gallery-entry-not-found');
    }
    nextText = nextText.replace(pattern, `$1$3${relUrl}$3`);
    localized.push({ id: item.id, fileName });
    fs.writeFileSync(GALLERY_PATH, nextText, 'utf8');
    console.log('ok');
  } catch (error) {
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).size < MIN_VALID_BYTES) {
      fs.rmSync(diskPath, { force: true });
    }
    console.log(`fail ${error?.message || error}`);
  }
}

if (localized.length > 0) {
  fs.writeFileSync(GALLERY_PATH, nextText, 'utf8');
}

console.log(
  JSON.stringify(
    {
      targeted: picked.length,
      localized: localized.length,
      sample: localized.slice(0, 20),
    },
    null,
    2,
  ),
);
