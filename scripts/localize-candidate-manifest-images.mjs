/**
 * Download already-discovered candidate manifest images to local files.
 *
 * This is faster and safer than re-searching Commons when the manifest already
 * has usable remote jpg/png/webp URLs. It prunes non-local/invalid entries for
 * the selected ids and rewrites accepted images to /images/worldscene-candidates.
 *
 * Usage:
 *   node scripts/localize-candidate-manifest-images.mjs --ids id1,id2
 *   node scripts/localize-candidate-manifest-images.mjs --limit 20
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/worldscene-candidates-core.mjs';
import {
  isLocalCandidateImageUrl,
  localImageExists,
  validatePromotionInput,
} from './lib/worldscene-promotion-qa.mjs';

const CANDIDATES_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');
const DATA_PATH = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene-candidates');

const GOOD_PROMINENCE = new Set(['world-famous', 'international', 'national']);

const MIN_BYTES = Number(process.env.MIN_BYTES || 35 * 1024);
const MAX_PER_POI = Number(process.env.MAX_PER_POI || 3);
const DOWNLOAD_TIMEOUT_MS = Number(process.env.DOWNLOAD_TIMEOUT_MS || 45000);
const IMAGE_MAX_WIDTH = Math.max(640, Number(process.env.IMAGE_MAX_WIDTH || 1600));
const DOWNLOAD_DELAY_MS = Number(process.env.DOWNLOAD_DELAY_MS || 1200);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = { ids: null, limit: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ids') {
      args.ids = new Set(String(argv[i + 1] || '').split(',').map((x) => x.trim()).filter(Boolean));
      i += 1;
    } else if (argv[i] === '--limit') {
      args.limit = Number(argv[i + 1] || 20) || 20;
      i += 1;
    }
  }
  return args;
}

function isImageUrl(url) {
  const clean = String(url || '').toLowerCase().split('?')[0];
  return /\.(jpe?g|png|webp)$/.test(clean);
}

function extFromUrl(url) {
  const clean = String(url || '').toLowerCase().split('?')[0];
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.webp')) return 'webp';
  return 'jpg';
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

async function commonsThumbUrlFromTitle(title, fallbackUrl) {
  if (!/^File:/i.test(String(title || ''))) return wikimediaThumbUrl(fallbackUrl);
  try {
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.searchParams.set('action', 'query');
    api.searchParams.set('format', 'json');
    api.searchParams.set('prop', 'imageinfo');
    api.searchParams.set('iiprop', 'url|mime|size');
    api.searchParams.set('iiurlwidth', String(IMAGE_MAX_WIDTH));
    api.searchParams.set('titles', title);
    api.searchParams.set('origin', '*');
    const response = await fetch(api, {
      headers: {
        'User-Agent': 'KosoCollection candidate image localizer/1.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) return wikimediaThumbUrl(fallbackUrl);
    const data = await response.json();
    const page = Object.values(data?.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    return info?.thumburl || wikimediaThumbUrl(fallbackUrl);
  } catch {
    return wikimediaThumbUrl(fallbackUrl);
  }
}

function safeBase(id) {
  return String(id)
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function candidateById() {
  const entries = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8')).entries ?? [];
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function existingIds() {
  const text = fs.readFileSync(DATA_PATH, 'utf8');
  return new Set([...text.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
}

function imageSourceUrl(image) {
  if (isLocalCandidateImageUrl(image.url || '')) return null;
  return image.remoteUrl || image.url || null;
}

function keepLocal(image) {
  return isLocalCandidateImageUrl(image?.url || '') && isImageUrl(image.url) && localImageExists(image.url);
}

function candidateRemoteImages(entry) {
  const images = entry?.images ?? [];
  return images
    .filter((image) => imageSourceUrl(image))
    .filter((image) => isImageUrl(imageSourceUrl(image)))
    .filter((image) => !/logo|loqosu|map|badge|flag|poster|coat of arms|emblem|interior|entrance|banner|park entrance|pdf/i.test(`${image.title || ''} ${image.pageTitle || ''} ${imageSourceUrl(image)}`))
    .filter((image) => !image.width || image.width >= 900)
    .filter((image) => !image.height || image.height >= 650)
    .sort((left, right) => (right.score || 0) - (left.score || 0));
}

async function download(url, outFile, title) {
  const downloadUrl = await commonsThumbUrlFromTitle(title, url);
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'KosoCollection candidate image localizer/1.0',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (response.status !== 429) break;
    const retryAfter = Number(response.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 5000 * (attempt + 1);
    await sleep(wait);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp|octet-stream)/i.test(type)) {
    throw new Error(`not image: ${type || 'unknown content-type'}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < MIN_BYTES) throw new Error(`too small: ${buffer.length}`);
  fs.writeFileSync(outFile, buffer);
  await sleep(DOWNLOAD_DELAY_MS);
  return buffer.length;
}

const args = parseArgs(process.argv.slice(2));
const candidates = candidateById();
const publishedIds = existingIds();
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

let ids = args.ids ? [...args.ids] : Object.keys(manifest);
ids = ids.filter((id) => candidates.has(id));

if (!args.ids) {
  ids = ids.filter((id) => {
    const candidate = candidates.get(id);
    const qa = validatePromotionInput(candidate, manifest[id], publishedIds);
    const reasons = new Set(qa.reasons);
    reasons.delete('missing-valid-local-image');
    return GOOD_PROMINENCE.has(candidate.prominence)
      && reasons.size === 0
      && qa.reasons.includes('missing-valid-local-image')
      && candidateRemoteImages(manifest[id]).length > 0;
  });
}

ids = ids.slice(0, args.limit);

let localized = 0;
let skipped = 0;
let failed = 0;

for (const id of ids) {
  const entry = manifest[id];
  if (!entry) {
    skipped += 1;
    continue;
  }

  const locals = (entry.images ?? []).filter(keepLocal);
  const remotes = candidateRemoteImages(entry);
  const nextImages = [...locals];

  for (const image of remotes) {
    if (nextImages.length >= MAX_PER_POI) break;
    const sourceUrl = imageSourceUrl(image);
    const ext = extFromUrl(sourceUrl);
    const fileName = `wcand-${safeBase(id)}-${nextImages.length + 1}.${ext}`;
    const diskPath = path.join(OUT_DIR, fileName);
    const publicUrl = `/images/worldscene-candidates/${fileName}`;

    try {
      if (!fs.existsSync(diskPath)) {
        const bytes = await download(sourceUrl, diskPath, image.title);
        console.log(`localized ${id} -> ${fileName} (${bytes} bytes)`);
      } else {
        console.log(`kept existing ${id} -> ${fileName}`);
      }
      nextImages.push({
        ...image,
        url: publicUrl,
        remoteUrl: sourceUrl,
      });
      localized += 1;
    } catch (error) {
      console.warn(`failed ${id} ${sourceUrl}: ${error.message}`);
      failed += 1;
    }
  }

  if (nextImages.length > 0) {
    manifest[id] = {
      ...entry,
      images: nextImages.slice(0, MAX_PER_POI),
    };
  } else {
    skipped += 1;
  }
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest)}\n`, 'utf8');
console.log(JSON.stringify({ ids: ids.length, localized, skipped, failed }, null, 2));
