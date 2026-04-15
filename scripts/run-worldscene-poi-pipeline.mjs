import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function run(args) {
  execFileSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function main() {
  run(['scripts/cache-worldscene-poi-catalog.mjs', '--replace']);
  run(['scripts/clean-worldscene-poi-orphans.mjs']);
  run(['scripts/rebuild-worldscene-poi-catalog.mjs']);
  run(['scripts/audit-worldscene-poi-catalog.mjs']);
}

main();
