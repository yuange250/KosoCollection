import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const MANIFEST = path.join(ROOT, 'public', 'images', 'worldscene', 'poi-manifest.json');
const REPORT_JSON = path.join(ROOT, 'public', 'images', 'worldscene', 'poi-audit.json');
const REPORT_MD = path.join(ROOT, 'public', 'images', 'worldscene', 'poi-audit.md');

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[_()[\]{}.,/\\:'"!?&\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return uniq(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length >= 2),
  );
}

function scoreTextMatch(haystack, needles) {
  const text = normalizeText(haystack);
  let score = 0;
  for (const needle of needles) {
    const norm = normalizeText(needle);
    if (!norm) continue;
    if (text === norm) score += 60;
    else if (text.includes(norm)) score += 25;

    for (const token of tokenize(needle)) {
      if (text.includes(token)) score += token.length >= 5 ? 6 : 3;
    }
  }
  return score;
}

function qualityPenalty(image) {
  let penalty = 0;
  const width = Number(image.width) || 0;
  const height = Number(image.height) || 0;
  if (width && height) {
    if (width < 640 || height < 360) penalty += 2;
    const ratio = width / height;
    if (ratio > 2.4 || ratio < 0.5) penalty += 1;
  }
  const blob = normalizeText([image.title, image.pageTitle, image.remoteUrl, image.source].join(' '));
  if (
    ['watermark', 'logo', 'icon', 'button', 'copyright', 'subscribe', 'close btn'].some((token) =>
      blob.includes(token),
    )
  ) {
    penalty += 3;
  }
  return penalty;
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

function judgePoint(point, manifestEntry) {
  const images = manifestEntry?.images ?? [];
  const needles = [point.name, point.englishName, point.country, point.city, ...point.aliases];
  const scoredImages = images.map((image) => {
    const blob = [image.title, image.pageTitle, image.source, ...(image.keywords ?? [])].join(' ');
    const relevanceScore = scoreTextMatch(blob, needles);
    const seasonalScore =
      (image.monthHints?.length ?? 0) * 8 +
      (image.seasonHints?.length ?? 0) * 14 +
      (image.capturedAt ? 10 : 0);
    const visualPenalty = qualityPenalty(image) * 20;
    const confidence = relevanceScore + seasonalScore + (image.score ?? 0) - visualPenalty;
    return {
      url: image.url,
      title: image.title || '',
      relevanceScore,
      seasonalScore,
      visualPenalty,
      confidence,
      monthHints: image.monthHints ?? [],
      seasonHints: image.seasonHints ?? [],
    };
  });

  scoredImages.sort((a, b) => b.confidence - a.confidence);
  const top = scoredImages.slice(0, 3);
  const matched = top.filter((item) => item.relevanceScore >= 40).length;
  const seasonTagged = top.filter((item) => item.monthHints.length > 0 || item.seasonHints.length > 0).length;
  const qualityGood = top.filter((item) => item.visualPenalty <= 20).length;

  let risk = 'high';
  if (top.length >= 3 && matched >= 2 && seasonTagged >= 1 && qualityGood >= 2) risk = 'low';
  else if (top.length >= 2 && matched >= 1 && qualityGood >= 1) risk = 'medium';

  return {
    id: point.id,
    name: point.name,
    englishName: point.englishName,
    imageCount: images.length,
    matched,
    seasonTagged,
    qualityGood,
    risk,
    top,
  };
}

function main() {
  const dataText = fs.readFileSync(DATA_TS, 'utf8');
  const points = parseDestinationBlocks(dataText);
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const report = points.map((point) => judgePoint(point, manifest[point.id]));

  const summary = {
    total: report.length,
    low: report.filter((item) => item.risk === 'low').length,
    medium: report.filter((item) => item.risk === 'medium').length,
    high: report.filter((item) => item.risk === 'high').length,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify({ summary, report }, null, 2), 'utf8');

  const md = [
    '# WorldScene POI Image Audit',
    '',
    `- Total: ${summary.total}`,
    `- Low risk: ${summary.low}`,
    `- Medium risk: ${summary.medium}`,
    `- High risk: ${summary.high}`,
    '',
    '## High Risk',
    ...report
      .filter((item) => item.risk === 'high')
      .map(
        (item) =>
          `- ${item.id} | ${item.name} | images=${item.imageCount} | matched=${item.matched} | seasonTagged=${item.seasonTagged} | qualityGood=${item.qualityGood}`,
      ),
    '',
    '## Medium Risk',
    ...report
      .filter((item) => item.risk === 'medium')
      .map(
        (item) =>
          `- ${item.id} | ${item.name} | images=${item.imageCount} | matched=${item.matched} | seasonTagged=${item.seasonTagged} | qualityGood=${item.qualityGood}`,
      ),
  ].join('\n');

  fs.writeFileSync(REPORT_MD, md, 'utf8');
  console.log(`已写入 ${REPORT_JSON}`);
  console.log(`已写入 ${REPORT_MD}`);
  console.log(JSON.stringify(summary));
}

main();
