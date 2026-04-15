import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IMAGE_DIR = path.join(ROOT, 'public', 'images', 'worldscene');
const MANIFEST_PATH = path.join(IMAGE_DIR, 'poi-manifest.json');
const DATA_PATH = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const OUTPUT_JSON = path.join(IMAGE_DIR, 'poi-status.json');
const OUTPUT_MD = path.join(IMAGE_DIR, 'poi-status.md');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDestinationIds() {
  const text = fs.readFileSync(DATA_PATH, 'utf8');
  return [...new Set([...text.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]))];
}

function loadDiskCoverage() {
  const files = fs
    .readdirSync(IMAGE_DIR)
    .filter((name) => /^poi-.*\.(jpg|jpeg|png|webp)$/i.test(name));

  const byPoint = new Map();
  for (const file of files) {
    const match = file.match(/^poi-(.+)-\d+\.(jpg|jpeg|png|webp)$/i);
    if (!match) continue;
    const id = match[1];
    byPoint.set(id, (byPoint.get(id) || 0) + 1);
  }

  return { files, byPoint };
}

function loadManifestCoverage() {
  const manifest = readJson(MANIFEST_PATH, {});
  const byPoint = new Map();

  for (const [id, entry] of Object.entries(manifest)) {
    byPoint.set(id, Array.isArray(entry?.images) ? entry.images.length : 0);
  }

  return { manifest, byPoint };
}

function topEntries(map, limit = 20) {
  return [...map.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
    .slice(0, limit);
}

function writeOutputs(report) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));

  const lines = [
    '# WorldScene POI Status',
    '',
    `- Total destinations: ${report.summary.totalDestinations}`,
    `- Manifest covered: ${report.summary.manifestCovered}`,
    `- Disk covered: ${report.summary.diskCovered}`,
    `- Manifest images: ${report.summary.manifestImages}`,
    `- Disk images: ${report.summary.diskImages}`,
    `- Pending manifest sync: ${report.summary.pendingManifestSync}`,
    '',
    '## Missing On Disk',
    ...report.missingOnDisk.slice(0, 50).map((id) => `- ${id}`),
    '',
    '## Missing In Manifest',
    ...report.missingInManifest.slice(0, 50).map((id) => `- ${id}`),
    '',
    '## Top Disk Coverage',
    ...report.topDiskCoverage.map((entry) => `- ${entry.id}: ${entry.count}`),
    '',
    '## Top Manifest Coverage',
    ...report.topManifestCoverage.map((entry) => `- ${entry.id}: ${entry.count}`),
    '',
  ];

  fs.writeFileSync(OUTPUT_MD, lines.join('\n'));
}

const destinationIds = loadDestinationIds();
const { files, byPoint: diskByPoint } = loadDiskCoverage();
const { byPoint: manifestByPoint } = loadManifestCoverage();

const manifestCovered = destinationIds.filter((id) => (manifestByPoint.get(id) || 0) > 0);
const diskCovered = destinationIds.filter((id) => (diskByPoint.get(id) || 0) > 0);
const missingOnDisk = destinationIds.filter((id) => (diskByPoint.get(id) || 0) === 0);
const missingInManifest = destinationIds.filter((id) => (manifestByPoint.get(id) || 0) === 0);
const pendingManifestSync = diskCovered.filter((id) => (manifestByPoint.get(id) || 0) === 0);

const report = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalDestinations: destinationIds.length,
    manifestCovered: manifestCovered.length,
    diskCovered: diskCovered.length,
    manifestImages: [...manifestByPoint.values()].reduce((sum, count) => sum + count, 0),
    diskImages: files.length,
    pendingManifestSync: pendingManifestSync.length,
  },
  missingOnDisk,
  missingInManifest,
  pendingManifestSync,
  topDiskCoverage: topEntries(diskByPoint),
  topManifestCoverage: topEntries(manifestByPoint),
};

writeOutputs(report);
console.log(JSON.stringify(report.summary, null, 2));
