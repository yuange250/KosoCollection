import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DATA_TS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'worldsceneData.ts');
const s = fs.readFileSync(DATA_TS, 'utf8');
const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const blocks = s.split(/\n  \{\n    id: /).slice(1);
const need = [];
for (const b of blocks) {
  const id = /^'([^']+)'/.exec(b)?.[1];
  const m = b.match(/\n    name:\s*(['"])((?:\\.|(?!\1).)*)\1/m);
  if (!id || !m) continue;
  let inner = m[2];
  inner = inner.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (!CJK.test(inner)) need.push({ id, name: inner });
}
console.log(JSON.stringify(need, null, 2));
console.log('count', need.length);
