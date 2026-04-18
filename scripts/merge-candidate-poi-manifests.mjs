/**
 * 将 candidate-poi-manifest.json 与各 worker 分片 manifest 合并为一份主 manifest。
 * worker 中同 id 覆盖主文件中较少图片的条目（以 images.length 多者优先）。
 *
 *   node scripts/merge-candidate-poi-manifests.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'worldscene');
const OUT = path.join(DIR, 'candidate-poi-manifest.json');

function load(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function imageCount(entry) {
  return entry?.images?.length ?? 0;
}

function main() {
  const files = fs.readdirSync(DIR).filter((f) => /^candidate-poi-manifest\.worker-\d+-of-\d+\.json$/.test(f));
  const merged = load(OUT);

  for (const f of files.sort()) {
    const chunk = load(path.join(DIR, f));
    for (const [id, entry] of Object.entries(chunk)) {
      if (id.startsWith('_')) continue;
      const prev = merged[id];
      if (!prev || imageCount(entry) > imageCount(prev)) {
        merged[id] = entry;
      }
    }
  }

  merged._mergedAt = new Date().toISOString();
  merged._mergeNote = `merged base + ${files.length} worker file(s)`;

  fs.writeFileSync(OUT, `${JSON.stringify(merged)}\n`, 'utf8');
  console.log(`Wrote ${OUT} (${Object.keys(merged).filter((k) => !k.startsWith('_')).length} POI keys)`);
}

main();
