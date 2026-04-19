import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';

const text = fs.readFileSync(DATA_PATH, 'utf8');
const ids = [...text.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);

const naturalHint = /National Park|Reserve|Desert|Forest|Wetland|Volcano|Mountain|Islands?|Coast|Floristic|Lake|River|Marsh|Oasis|Kingdom/i;

let next = text;

for (const id of ids) {
  const pattern = new RegExp(`  \\{\\n    id: "${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",[\\s\\S]*?\\n  \\},`, 'm');
  const match = next.match(pattern);
  if (!match) continue;
  const block = match[0];
  const englishName = block.match(/englishName:\s*"([^"]+)"/)?.[1] ?? '';
  const currentCategory = block.match(/category:\s*"([^"]+)"/)?.[1] ?? '';
  if (!naturalHint.test(englishName)) continue;
  if (currentCategory === '自然景观') continue;

  let replaced = block
    .replace(/category:\s*"[^"]+"/, 'category: "自然景观"')
    .replace(/tags:\s*\[[^\]]*\]/, 'tags: ["自然景观", "世界遗产", "景观辨识度高"]')
    .replace(/highlights:\s*\[[^\]]*\]/, 'highlights: ["景观主体明确", "自然景观辨识度高", "适合独立成点"]');

  const name = block.match(/name:\s*"([^"]+)"/)?.[1] ?? englishName;
  replaced = replaced
    .replace(/tagline:\s*"[^"]*"/, `tagline: "${name}以自然景观见长，空间轮廓和首图主体都比较明确。"`)
    .replace(/description:\n\s*"[^"]*"/, `description:\n      "${name}适合放进正式主表，因为它拥有比较稳定的自然景观识别度，不只是一个泛泛的占位型候补点。"`);

  next = next.replace(pattern, replaced);
}

fs.writeFileSync(DATA_PATH, next, 'utf8');
console.log(JSON.stringify({ fixed: true }, null, 2));
