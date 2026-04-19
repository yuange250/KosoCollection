/**
 * Set Chinese display `name` for published destinations whose `name` lacked CJK.
 * Run from repo root: node scripts/apply-worldscene-display-names-zh.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DISPLAY_NAME_ZH } from './worldscene-display-name-zh-map.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');

function escapeSingleQuoted(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function replaceNameForId(source, id, newDisplayName) {
  const escId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(\\n    id: '${escId}',\\n    name: )(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')`,
    'm',
  );
  const m = re.exec(source);
  if (!m) {
    return { ok: false, error: 'block not found or name pattern mismatch' };
  }
  const newLine = `${m[1]}'${escapeSingleQuoted(newDisplayName)}'`;
  return { ok: true, next: source.slice(0, m.index) + newLine + source.slice(m.index + m[0].length) };
}

let text = fs.readFileSync(DATA_TS, 'utf8');
const missing = [];
for (const [id, zh] of Object.entries(DISPLAY_NAME_ZH)) {
  const r = replaceNameForId(text, id, zh);
  if (!r.ok) missing.push(id);
  else text = r.next;
}
if (missing.length) {
  console.error('Failed to replace name for ids:', missing.join(', '));
  process.exit(1);
}
fs.writeFileSync(DATA_TS, text);
console.log('Updated', Object.keys(DISPLAY_NAME_ZH).length, 'destination display names to Chinese.');
