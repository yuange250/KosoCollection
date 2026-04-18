/**
 * 将 data/worldscene/candidate-poi-coord-overrides.json 中的概略坐标
 * 写入仍缺坐标的候补条目（仅当 id 匹配且仍 needsCoord）。
 *
 *   node scripts/apply-candidate-coord-overrides.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CANDIDATE = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const OVERRIDES = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-coord-overrides.json');

function needsCoord(e) {
  const lat = e.lat;
  const lng = e.lng;
  if (lat == null || lng == null) return true;
  if (Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) return true;
  return false;
}

function main() {
  const bundle = JSON.parse(fs.readFileSync(CANDIDATE, 'utf8'));
  const { overrides = {}, note, schemaVersion } = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
  let applied = 0;
  let skipped = 0;

  for (const e of bundle.entries) {
    if (!needsCoord(e)) continue;
    const o = overrides[e.id];
    if (!o) {
      skipped += 1;
      continue;
    }
    e.lat = Number(o.lat);
    e.lng = Number(o.lng);
    e.sources = [
      ...(e.sources || []).filter((s) => s.type !== 'coord-manual-override'),
      {
        type: 'coord-manual-override',
        note: note || 'manual approximate coordinates',
        ref: o.ref || '',
        schemaVersion: schemaVersion ?? 1,
      },
    ];
    applied += 1;
  }

  bundle.updatedAt = new Date().toISOString();
  bundle.coordManualOverrides = { applied, skippedStillMissing: skipped, note: 'candidate-poi-coord-overrides.json' };
  fs.writeFileSync(CANDIDATE, `${JSON.stringify(bundle)}\n`, 'utf8');
  console.log('applied', applied, 'still missing coord (no override id)', skipped);
}

main();
