/**
 * Start multiple detached workers for fast candidate lead-image seeding.
 *
 * Examples:
 *   node scripts/run-candidate-poi-lead-images-parallel.mjs 4
 *   $env:ENABLE_WIKIPEDIA_FALLBACK='0'; node scripts/run-candidate-poi-lead-images-parallel.mjs 6
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const shards = Math.max(1, Math.min(16, Number(process.argv[2] || 4) || 4));

fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });

console.log(`Starting ${shards} lead-image workers (shard 0..${shards - 1})`);
console.log('Logs: tmp/candidate-poi-lead-images.worker-<shard>.log');
console.log('Then run: node scripts/merge-candidate-poi-manifests.mjs\n');

const node = process.execPath;
const script = path.join(ROOT, 'scripts', 'seed-candidate-poi-lead-images.mjs');

for (let shard = 0; shard < shards; shard += 1) {
  const logPath = path.join(ROOT, 'tmp', `candidate-poi-lead-images.worker-${shard}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(node, [script, '--shard', String(shard), '--shards', String(shards)], {
    cwd: ROOT,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    env: {
      ...process.env,
      ...(process.env.API_GAP_MS ? {} : { API_GAP_MS: '180' }),
      ...(process.env.BATCH_SIZE ? {} : { BATCH_SIZE: '40' }),
      ...(process.env.ENABLE_WIKIPEDIA_FALLBACK ? {} : { ENABLE_WIKIPEDIA_FALLBACK: '0' }),
    },
  });
  child.unref();
  fs.closeSync(logFd);
  console.log(`worker ${shard} pid=${child.pid} -> ${path.relative(ROOT, logPath)}`);
}

console.log('\nWorkers detached. Merge when all workers finish: node scripts/merge-candidate-poi-manifests.mjs');
