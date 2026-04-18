/**
 * 统计候补配图 manifest（不写已上架数据）。
 *   node scripts/report-candidate-poi-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MANIFEST = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');
const CANDIDATES = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const DATA_DIR = path.join(ROOT, 'data', 'worldscene');

const MIN_OK = Number(process.env.MIN_IMAGES || 5);

function main() {
  const total = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8')).entries.length;
  let manifest = {};
  if (fs.existsSync(MANIFEST)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    } catch {
      manifest = {};
    }
  }

  const workerFiles = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter((f) => /^candidate-poi-manifest\.worker-\d+-of-\d+\.json$/.test(f))
    : [];

  const ids = Object.keys(manifest).filter((k) => !k.startsWith('_'));
  let ge5 = 0;
  let lt5 = 0;
  let zero = 0;
  let totalSlots = 0;

  for (const id of ids) {
    const n = manifest[id]?.images?.length ?? 0;
    totalSlots += n;
    if (n === 0) zero += 1;
    else if (n < MIN_OK) lt5 += 1;
    else ge5 += 1;
  }

  const workerStats = workerFiles.map((f) => {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      const keys = Object.keys(o).filter((k) => !k.startsWith('_'));
      const slots = keys.reduce((s, id) => s + (o[id]?.images?.length ?? 0), 0);
      return { file: f, keys: keys.length, imageSlots: slots };
    } catch {
      return { file: f, keys: 0, imageSlots: 0, error: true };
    }
  });

  console.log(
    JSON.stringify(
      {
        candidateEntriesTotal: total,
        manifestPoiKeys: ids.length,
        imagesGeMin: ge5,
        imagesLtMin: lt5,
        imagesZero: zero,
        totalImageSlotsInManifest: totalSlots,
        minOkThreshold: MIN_OK,
        workerShardFiles: workerStats,
      },
      null,
      2,
    ),
  );
}

main();
