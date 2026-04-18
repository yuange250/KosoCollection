/**
 * 并行启动多个 cache-candidate-poi-images 分片进程（独立 manifest，避免抢写）。
 *
 *   node scripts/run-candidate-poi-images-parallel.mjs 4
 *
 * 日志：tmp/candidate-poi-images.worker-{shard}.log
 * 全部结束后请执行：node scripts/merge-candidate-poi-manifests.mjs
 *
 * 注意：同一公网 IP 并发过高易触发 Wikimedia 429，默认 2 路；仍 429 时请改单进程或加大各 *_DELAY_* / API_GAP_MS。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const shards = Math.max(1, Math.min(16, Number(process.argv[2] || 2) || 2));

fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });

console.log(`Starting ${shards} workers (shard 0..${shards - 1})`);
console.log(`Logs: tmp/candidate-poi-images.worker-<shard>.log`);
console.log('Then run: node scripts/merge-candidate-poi-manifests.mjs\n');

const node = process.execPath;
const script = path.join(ROOT, 'scripts', 'cache-candidate-poi-images.mjs');

for (let shard = 0; shard < shards; shard += 1) {
  const logPath = path.join(ROOT, 'tmp', `candidate-poi-images.worker-${shard}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(
    node,
    [script, '--shard', String(shard), '--shards', String(shards)],
    {
      cwd: ROOT,
      stdio: ['ignore', logFd, logFd],
      detached: true,
      env: {
        ...process.env,
        ...(process.env.DOWNLOAD_DELAY_MS ? {} : { DOWNLOAD_DELAY_MS: '12000' }),
        ...(process.env.INTER_ENTRY_DELAY_MS ? {} : { INTER_ENTRY_DELAY_MS: '22000' }),
        ...(process.env.API_GAP_MS ? {} : { API_GAP_MS: '1200' }),
      },
    },
  );
  child.unref();
  fs.closeSync(logFd);
  console.log(`worker ${shard} pid=${child.pid} -> ${path.relative(ROOT, logPath)}`);
}

console.log('\nWorkers detached. Check Task Manager for node.exe processes.');
