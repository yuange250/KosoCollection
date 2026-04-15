/**
 * Delete WorldScene POI image files that share identical bytes with images of other POIs
 * (generic placeholders wrongly reused). Then: npm run rebuild:worldscene-poi
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'images', 'worldscene');

const dryRun = process.argv.includes('--dry-run');

function main() {
  const files = fs.readdirSync(DIR).filter((f) => /^poi-.+-\d+\.(jpg|jpeg|png|webp)$/i.test(f));
  const byHash = new Map();
  for (const f of files) {
    const buf = fs.readFileSync(path.join(DIR, f));
    const h = crypto.createHash('sha256').update(buf).digest('hex');
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }

  const dupGroups = [...byHash.entries()].filter(([, arr]) => arr.length > 1);
  const toDelete = new Set();
  for (const [, arr] of dupGroups) {
    for (const f of arr) toDelete.add(f);
  }

  console.log('duplicate groups', dupGroups.length, 'files to remove', toDelete.size);
  for (const [, arr] of dupGroups) console.log(' ', arr.join(', '));

  if (!dryRun) {
    for (const f of toDelete) {
      fs.unlinkSync(path.join(DIR, f));
    }
  } else {
    console.log('DRY RUN — no files deleted');
  }
}

main();
