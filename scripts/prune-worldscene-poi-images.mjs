/**
 * Remove WorldScene POI images whose title/pageTitle/metadata fail required-term checks.
 * Then run: npm run rebuild:worldscene-poi
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const MANIFEST = path.join(ROOT, 'public', 'images', 'worldscene', 'poi-manifest.json');

/** Mirrors src/lib/worldscenePoiOverrides.ts (keep in sync when overrides change) */
const OVERRIDES = {
  'forbidden-city': {
    requiredTerms: ['forbidden city', 'palace museum', '故宫', '紫禁城'],
    excludedTerms: ['map', 'ticket', 'logo'],
  },
  'great-wall': { requiredTerms: ['great wall', '长城'] },
  'mount-fuji': { requiredTerms: ['fuji', '富士'] },
  kyoto: { requiredTerms: ['kyoto', '京都'] },
  'eiffel-tower': { requiredTerms: ['eiffel', 'tour eiffel', '铁塔'] },
  santorini: { requiredTerms: ['santorini', 'oia', '圣托里尼'] },
  reykjavik: { requiredTerms: ['reykjavik', '雷克雅未克'] },
  'west-lake-hangzhou': { requiredTerms: ['west lake', 'hangzhou', '西湖'] },
  'jiuzhaigou-valley': { requiredTerms: ['jiuzhaigou', '九寨沟'] },
  'huangshan-yellow-mountain': { requiredTerms: ['huangshan', 'yellow mountain', '黄山'] },
  'potala-palace-lhasa': { requiredTerms: ['potala', '布达拉宫'] },
  'kanas-lake-scenic': { requiredTerms: ['kanas', '喀纳斯'] },
  'heaven-lake-changbai': { requiredTerms: ['changbai', 'heaven lake', '天池', '长白山'] },
  'yading-nature-reserve': { requiredTerms: ['yading', 'daocheng', '亚丁', '稻城'] },
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[_()[\]{}.,/\\:'"!?&\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function nameSegments(name) {
  const raw = String(name || '');
  return uniq(
    raw
      .split(/[（）()\[\]、，,与和及/\s|]+/u)
      .map((s) => normalizeText(s))
      .filter((s) => s.length >= 2),
  );
}

function parseDestinationBlocks(text) {
  const blocks = text.match(/  \{\n[\s\S]*?\n  \},?/g) ?? [];
  const rows = [];

  for (const block of blocks) {
    const id = block.match(/\n\s{4}id: '([^']+)'/u)?.[1];
    const name = block.match(/\n\s{4}name: '([^']+)'/u)?.[1];
    const englishName = block.match(/\n\s{4}englishName: '([^']+)'/u)?.[1];
    const country = block.match(/\n\s{4}country: '([^']+)'/u)?.[1];
    const city = block.match(/\n\s{4}city: '([^']+)'/u)?.[1];
    const aliasMatch = block.match(/\n\s{4}aliases: \[([^\]]*)\]/u)?.[1] ?? '';
    const aliases = [...aliasMatch.matchAll(/'([^']+)'/g)].map((item) => item[1]);
    if (!id || !name || !englishName || !country || !city) continue;
    rows.push({ id, name, englishName, country, city, aliases });
  }

  return rows;
}

function defaultRequiredTerms(point) {
  const parts = [
    normalizeText(point.name),
    normalizeText(point.city),
    normalizeText(point.country),
    ...point.aliases.map((a) => normalizeText(a)),
    ...nameSegments(point.name),
  ];
  const english = normalizeText(point.englishName);
  for (const token of english.split(' ')) {
    if (token.length >= 4) parts.push(token);
  }
  return uniq(parts.filter((t) => t.length >= 2));
}

function imageBlob(image) {
  const kw = Array.isArray(image.keywords) ? image.keywords.join(' ') : '';
  return normalizeText([image.title, image.pageTitle, image.source, kw].join(' '));
}

function passes(image, point) {
  const blob = imageBlob(image);
  const override = OVERRIDES[point.id];
  const required = override?.requiredTerms?.map(normalizeText) ?? defaultRequiredTerms(point);
  const excluded = (override?.excludedTerms ?? []).map(normalizeText).filter(Boolean);

  if (excluded.some((term) => term.length >= 2 && blob.includes(term))) return false;

  // 元数据极短：无法可靠判断，保留（避免误删）
  if (blob.length < 6) return true;

  return required.some((term) => term.length >= 2 && blob.includes(term));
}

const dryRun = process.argv.includes('--dry-run');

function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.error('missing manifest', MANIFEST);
    process.exit(1);
  }
  const dataPoints = parseDestinationBlocks(fs.readFileSync(DATA_TS, 'utf8'));
  const pointMeta = Object.fromEntries(dataPoints.map((p) => [p.id, p]));

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let removed = 0;
  const log = [];

  for (const [pointId, entry] of Object.entries(manifest)) {
    const meta = pointMeta[pointId];
    const point = meta
      ? { id: pointId, ...meta }
      : { id: pointId, ...entry.point, aliases: [] };
    const images = entry.images ?? [];
    const kept = [];
    for (const image of images) {
      if (passes(image, point)) {
        kept.push(image);
        continue;
      }
      const filePath = path.join(ROOT, 'public', image.url.replace(/^\//, ''));
      log.push({ pointId, url: image.url, blob: imageBlob(image).slice(0, 120) });
      if (fs.existsSync(filePath)) {
        if (!dryRun) fs.unlinkSync(filePath);
        removed += 1;
      } else if (!dryRun) {
        console.warn('missing file', filePath);
      }
    }
    manifest[pointId] = { ...entry, images: kept };
  }

  if (!dryRun) {
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
  }

  console.log(dryRun ? 'DRY RUN — no files deleted, manifest not written' : `Removed ${removed} files`);
  console.log('Pruned entries:', log.length);
  if (log.length) console.log(log.slice(0, 40));
  if (log.length > 40) console.log(`… and ${log.length - 40} more`);
}

main();
