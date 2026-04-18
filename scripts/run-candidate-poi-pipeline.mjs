/**
 * 候补景点批量处理（仅写 data/worldscene/candidate-pois.json，不修改已上架 worldsceneData）。
 *
 *   node scripts/run-candidate-poi-pipeline.mjs
 *
 * 步骤：
 *   0) 种子 Wikidata Q 修正写入候补 JSON
 *   1) Wikidata P625 坐标
 *   2) Wikidata 简介/标签
 *   3) Nominatim：无 Q 号条目
 *   4) Nominatim：有 Q 号仍缺坐标（名称检索兜底）
 *
 * 环境变量：各子脚本支持的 BATCH、SLEEP_MS、LIMIT 等可继续沿用。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function run(nodeArgs) {
  const r = spawnSync(process.execPath, nodeArgs, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const steps = [
  ['scripts/apply-candidate-wikidata-seed-fixes.mjs'],
  ['scripts/backfill-candidate-poi-coords.mjs'],
  ['scripts/backfill-candidate-poi-descriptions.mjs'],
  ['scripts/geocode-candidate-poi-nominatim.mjs'],
  ['scripts/geocode-candidate-poi-nominatim.mjs', '--wikidata-fallback'],
  ['scripts/apply-candidate-coord-overrides.mjs'],
];

console.log('=== candidate POI pipeline (候补 only) ===\n');
for (const args of steps) {
  console.log('→ node', args.join(' '), '\n');
  run(args);
}
console.log('\n=== stats ===\n');
run(['scripts/candidate-poi-stats.mjs']);
