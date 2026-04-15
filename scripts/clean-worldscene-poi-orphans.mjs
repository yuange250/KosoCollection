import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene');
const MANIFEST = path.join(OUT_DIR, 'poi-manifest.json');

function main() {
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  const keep = new Set(
    Object.values(manifest)
      .flatMap((entry) => entry.images ?? [])
      .map((image) => image.url)
      .filter(Boolean)
      .map((url) => String(url).replace(/^\/images\/worldscene\//, '')),
  );

  const files = fs.existsSync(OUT_DIR) ? fs.readdirSync(OUT_DIR) : [];
  const orphaned = files.filter((file) => /^poi-.*\.(jpg|jpeg|png|webp)$/i.test(file) && !keep.has(file));

  const removed = [];
  const skipped = [];
  for (const file of orphaned) {
    try {
      fs.rmSync(path.join(OUT_DIR, file), { force: true });
      removed.push(file);
    } catch (error) {
      skipped.push({
        file,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ removed: removed.length, files: removed, skipped }, null, 2));
}

main();
