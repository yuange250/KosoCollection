import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';
const CANDIDATES_PATH = 'C:/codes/KosoCollection/data/worldscene/candidate-pois.json';

const raw = fs.readFileSync(DATA_PATH, 'utf8');
const candidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8')).entries;
const candidateById = new Map(candidates.map((entry) => [entry.id, entry]));

const hasCjk = (value = '') => /[\u3400-\u9fff]/.test(value);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readQuotedField = (block, field) => {
  const match = block.match(new RegExp(`${field}:\\s*(?:"([^"]*)"|'([^']*)')`));
  return match ? match[1] ?? match[2] ?? '' : '';
};

const replaceQuotedField = (block, field, value) =>
  block.replace(
    new RegExp(`(${field}:\\s*)(?:"[^"]*"|'[^']*')`),
    (_, prefix) => `${prefix}${JSON.stringify(value)}`,
  );

const rewriteMultilineStringField = (block, field, value) =>
  block.replace(
    new RegExp(`(${field}:\\s*\\n\\s*)(?:"[^"]*"|'[^']*')`),
    (_, prefix) => `${prefix}${JSON.stringify(value)}`,
  ).replace(
    new RegExp(`(${field}:\\s*)(?:"[^"]*"|'[^']*')`),
    (_, prefix) => `${prefix}${JSON.stringify(value)}`,
  );

const normalizeCopy = (value, name) => {
  if (!value) return value;
  let next = value;

  const leadingPatterns = [
    `${name}适合留在主表，因为`,
    `${name}适合进入主表，因为`,
    `${name}适合放在主表里，因为`,
    `${name}适合放进主表里，因为`,
    `${name}适合单独上架，因为`,
    `${name}适合单独成点，因为`,
    `${name}值得留在主表，因为`,
    `${name}值得进入主表，因为`,
    `${name}值得放在主表里，因为`,
    `${name}值得单独上架，因为`,
    `${name}值得单独成点，因为`,
  ];

  for (const pattern of leadingPatterns) {
    if (next.startsWith(pattern)) {
      next = `${name}${next.slice(pattern.length)}`;
    }
  }

  const replacements = [
    [/适合留在主表/g, '值得被认真展开'],
    [/适合进入主表/g, '值得被认真展开'],
    [/适合放在主表里/g, '值得被认真展开'],
    [/适合放进主表里/g, '值得被认真展开'],
    [/值得留在主表/g, '值得被认真展开'],
    [/值得进入主表/g, '值得被认真展开'],
    [/值得放在主表里/g, '值得被认真展开'],
    [/适合单独上架/g, '值得单独介绍'],
    [/适合单独成点/g, '值得单独介绍'],
    [/值得单独上架/g, '值得单独介绍'],
    [/值得单独成点/g, '值得单独介绍'],
    [/主表/g, '景点库'],
    [/上架/g, '呈现'],
    [/适合展示/g, '很适合观看'],
    [/补强[^，。；]*版块/g, '补足这类景观的代表性'],
    [/补强[^，。；]*板块/g, '补足这类景观的代表性'],
    [/补强[^，。；]*主题/g, '补足这类主题的代表性'],
    [/在官方目的地库中可补强典型自然样本：尺度稳定、画面结构清楚，便于建立第一印象并与同类型目的地对照叙事。/g, '这里的自然景观尺度开阔、画面结构清晰，初看就能留下很鲜明的印象。'],
    [/在官方目的地库中可补强典型人文样本：历史主题明确、空间轮廓稳定，便于建立第一印象并与同类型目的地对照叙事。/g, '这里的人文主题清晰，建筑与空间轮廓稳定，很容易建立鲜明而完整的第一印象。'],
    [/叙事型表达/g, '叙事感'],
    [/空间叙事/g, '空间层次'],
    [/时间叙事/g, '时间感'],
    [/\bmonument\b/gi, '纪念碑式景观'],
    [/\bcitywalk\b/gi, '城市漫游'],
    [/\bskyline\b/gi, '城市天际线'],
    [/\bNational Park\b/g, '国家公园'],
    [/\bUNESCO\b/g, '世界遗产'],
  ];

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  next = next
    .replace(/，，+/g, '，')
    .replace(/。。+/g, '。')
    .replace(/，，/g, '，')
    .replace(/^\s*，/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return next;
};

const objectPattern = /  \{[\s\S]*?\n  \},/g;
let rewritten = raw;
let normalizedCount = 0;
let renamedCount = 0;

rewritten = rewritten.replace(objectPattern, (block) => {
  const id = readQuotedField(block, 'id');
  if (!id) return block;

  let next = block;
  const candidate = candidateById.get(id);
  const currentName = readQuotedField(next, 'name');
  const currentEnglishName = readQuotedField(next, 'englishName');
  const currentTagline = readQuotedField(next, 'tagline');
  const currentDescription = readQuotedField(next, 'description');

  if (candidate?.name && hasCjk(candidate.name) && candidate.name !== currentName) {
    next = replaceQuotedField(next, 'name', candidate.name);
    renamedCount += 1;
  }

  if (candidate?.englishName && candidate.englishName !== currentEnglishName) {
    next = replaceQuotedField(next, 'englishName', candidate.englishName);
  }

  const effectiveName = candidate?.name && hasCjk(candidate.name) ? candidate.name : currentName;
  const normalizedTagline = normalizeCopy(currentTagline, effectiveName);
  const normalizedDescription = normalizeCopy(currentDescription, effectiveName);

  if (normalizedTagline !== currentTagline) {
    next = replaceQuotedField(next, 'tagline', normalizedTagline);
    normalizedCount += 1;
  }

  if (normalizedDescription !== currentDescription) {
    next = rewriteMultilineStringField(next, 'description', normalizedDescription);
    normalizedCount += 1;
  }

  return next;
});

const globalPhraseReplacements = [
  [
    /在官方目的地库中可补强典型自然样本：尺度稳定、画面结构清楚，便于建立第一印象并与同类型目的地对照叙事。/g,
    '这里的自然景观尺度开阔、画面结构清晰，初看就能留下很鲜明的印象。',
  ],
  [
    /在官方目的地库中可补强典型人文样本：历史主题明确、空间轮廓稳定，便于建立第一印象并与同类型目的地对照叙事。/g,
    '这里的人文主题清晰，建筑与空间轮廓稳定，很容易建立鲜明而完整的第一印象。',
  ],
];

for (const [pattern, replacement] of globalPhraseReplacements) {
  rewritten = rewritten.replace(pattern, replacement);
}

fs.writeFileSync(DATA_PATH, rewritten, 'utf8');

console.log(
  JSON.stringify(
    {
      renamedCount,
      normalizedCount,
    },
    null,
    2,
  ),
);
