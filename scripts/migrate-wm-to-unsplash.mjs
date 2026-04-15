/**
 * 将 project2Data.ts 中 wmCard(外链...) 改为 wmCard('景点id', kind)
 * 运行: node scripts/migrate-wm-to-unsplash.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'src', 'lib', 'project2Data.ts');

let text = fs.readFileSync(DATA, 'utf8');

const lines = text.split(/\r?\n/);
const out = [];
let lastId = '';
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const idMatch = line.match(/^\s*id:\s*'([^']+)',\s*$/);
  if (idMatch) lastId = idMatch[1];

  if (/^\s*images:\s*wmCard\(/.test(line)) {
    if (!lastId) throw new Error(`wmCard before any id at line ${i + 1}`);
    let block = line;
    while (!/\)\s*,\s*$/.test(block)) {
      i += 1;
      if (i >= lines.length) throw new Error('unclosed wmCard');
      block += '\n' + lines[i];
    }
    const km = block.match(/,\s*'(heritage|nature|city|coast)'\s*(?:,|\))/);
    if (!km) throw new Error(`no kind in block near ${lastId}: ${block.slice(0, 120)}`);
    const kind = km[1];
    const indent = line.match(/^(\s*)/)[1];
    out.push(`${indent}images: wmCard('${lastId}', '${kind}'),`);
    i += 1;
    continue;
  }

  out.push(line);
  i += 1;
}

text = out.join('\n');

// import
if (!text.includes("from './project2StockPhotos'")) {
  text = text.replace(
    /^export type TravelMode/m,
    "import { pickStockGalleryUrls, type StockKind } from './project2StockPhotos';\n\nexport type TravelMode",
  );
}

// replace wmCard implementation
const wmOld =
  /\/\*\*[\s\S]*?const wmCard = \([\s\S]*?return out\.slice\(0, 10\);\r?\n\};/m;

const wmNew = `/**
 * 景点图库：Unsplash 旅行风配图（按景点 id 稳定选图）+ 站内占位，用于详情轮播。
 * 图源见 project2StockPhotos.ts（非具体 POI 官方照片）。
 */
const wmCard = (pointId: string, kind: StockKind) => {
  const stocks = pickStockGalleryUrls(pointId, kind, 3);
  const [base, atlas] = imageSet(kind);
  const crossKind: StockKind = kind === 'heritage' || kind === 'city' ? 'nature' : 'heritage';
  const [crossBase] = imageSet(crossKind);
  const sequence = [
    ...stocks,
    atlas,
    base,
    crossBase,
    '/placeholders/event.svg',
    '/placeholders/timeline_banner.png',
  ];
  const seen = new Set<string>();
  const outArr: string[] = [];
  for (const url of sequence) {
    if (!seen.has(url)) {
      seen.add(url);
      outArr.push(url);
    }
  }
  return outArr.slice(0, 10);
};`;

if (!wmOld.test(text)) throw new Error('wmCard block not found for replacement');
text = text.replace(wmOld, wmNew);

fs.writeFileSync(DATA, text, 'utf8');
console.log('Migrated', DATA);
