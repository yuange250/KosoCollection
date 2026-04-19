import fs from 'node:fs';

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';
const CANDIDATES_PATH = 'C:/codes/KosoCollection/data/worldscene/candidate-pois.json';

const dataText = fs.readFileSync(DATA_PATH, 'utf8');
const candidatesRaw = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
const candidateById = new Map(candidatesRaw.entries.map((entry) => [entry.id, entry]));

const hasCJK = (value = '') => /[\u3400-\u9fff]/.test(value);

const quote = (value) => JSON.stringify(value ?? '', null, 0);

const normalizeName = (candidate) => {
  if (hasCJK(candidate.name || '')) return candidate.name;
  return candidate.englishName || candidate.name || candidate.id;
};

const normalizeEnglishName = (candidate) => candidate.englishName || candidate.name || candidate.id;

const pickGrade = (candidate) => (candidate.prominence === 'world-famous' ? '5A' : '精品');

const pickSeason = (candidate) => {
  const blob = [candidate.summary, candidate.descriptionEn, candidate.englishName, candidate.country].filter(Boolean).join(' ');
  if (/desert|oasis|sahara|arab/i.test(blob)) return '10-4 months';
  if (/arctic|northern|labrador|greenland/i.test(blob)) return '6-9 months';
  if (/rainforest|tropical|island|amazon/i.test(blob)) return '5-11 months';
  return '4-10 months';
};

const pickBudgets = (candidate) => {
  const blob = [candidate.country, candidate.englishName, candidate.summary].filter(Boolean).join(' ');
  if (/Greenland|Norway|Sweden|Switzerland|United Kingdom|France|Germany|Japan|Canada/i.test(blob)) {
    return { ticketCny: 100, stayCny: 520, mealCny: 180 };
  }
  if (/China|People's Republic of China|Bangladesh|Mauritania|Syria|Peru|Jordan|Oman|Morocco|Kazakhstan|Brazil|Mexico|Iraq/i.test(blob)) {
    return { ticketCny: 60, stayCny: 320, mealCny: 120 };
  }
  return { ticketCny: 80, stayCny: 420, mealCny: 150 };
};

const deriveTopic = (candidate) => {
  const blob = [candidate.summary, candidate.descriptionEn, candidate.englishName, ...(candidate.tags || [])].filter(Boolean).join(' ').toLowerCase();
  if (/cathedral|church|abbey|monastery|temple|basilica/.test(blob)) return '宗教建筑';
  if (/archaeological|archaeology|ruins|ancient city|tomb/.test(blob)) return '考古遗址';
  if (/palace|castle|fort|citadel/.test(blob)) return '历史建筑';
  if (/village|town|ksour|settlement|landscape/.test(blob)) return '聚落景观';
  if (/desert|dune|sahara/.test(blob)) return '荒漠景观';
  if (/wetland|marsh|lake|river|water/.test(blob)) return '水域景观';
  if (/forest|rainforest|jungle/.test(blob)) return '森林景观';
  if (/mountain|volcano|peak|alpine|ridge/.test(blob)) return '山地景观';
  if (/island|coast|marine|sea/.test(blob)) return '海岸景观';
  if (/wine|terrace|oasis/.test(blob)) return '文化景观';
  return (candidate.category || '').includes('自然') ? '自然景观' : '人文古迹';
};

const pickCategory = (candidate) => {
  const topic = deriveTopic(candidate);
  const naturalTopics = new Set(['荒漠景观', '水域景观', '森林景观', '山地景观', '海岸景观', '自然景观', '文化景观']);
  if ((candidate.englishName || '').match(/National Park|Desert|Forest|Wetland|Volcano|Mountain|Island|Coast|Reserve/i)) {
    return '自然景观';
  }
  if (naturalTopics.has(topic) && !['宗教建筑', '考古遗址', '历史建筑', '聚落景观'].includes(topic)) {
    return '自然景观';
  }
  return (candidate.category || '').includes('自然') ? '自然景观' : '人文古迹';
};

const buildTagline = (candidate) => {
  const topic = deriveTopic(candidate);
  if (pickCategory(candidate).includes('自然')) {
    return `${normalizeName(candidate)}以${topic}见长，景观轮廓清晰，首图就能建立明确记忆点。`;
  }
  return `${normalizeName(candidate)}具备鲜明的${topic}特征，作为独立景点的辨识度和叙事感都比较强。`;
};

const buildDescription = (candidate) => {
  const topic = deriveTopic(candidate);
  const zhName = normalizeName(candidate);
  if (pickCategory(candidate).includes('自然')) {
    return `${zhName}适合进入正式主表，因为它不是普通的国家公园占位点，而是拥有稳定视觉主体和明确地域气质的${topic}目的地。`;
  }
  return `${zhName}值得单独上架，因为它不依赖更大的城市或景区母体就能成立，本身就具备清楚的历史主题、空间形态和浏览价值。`;
};

const pickTags = (candidate) => {
  const tags = [];
  tags.push(pickCategory(candidate).includes('自然') ? '自然景观' : '人文古迹');
  if ((candidate.tags || []).includes('UNESCO') || /world heritage|世界遗产/i.test([candidate.summary, candidate.descriptionEn].filter(Boolean).join(' '))) {
    tags.push('世界遗产');
  }
  const topic = deriveTopic(candidate);
  if (!['自然景观', '人文古迹'].includes(topic)) tags.push(topic);
  if ((candidate.englishName || '').includes('National Park')) tags.push('国家公园');
  return Array.from(new Set(tags)).slice(0, 3);
};

const pickHighlights = (candidate) => {
  const topic = deriveTopic(candidate);
  if (pickCategory(candidate).includes('自然')) {
    return ['景观主体明确', `具备${topic}特征`, '适合独立成点'];
  }
  return ['历史主题清楚', `具备${topic}辨识度`, '适合独立成点'];
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const polishBlock = (id, originalBlock) => {
  const candidate = candidateById.get(id);
  if (!candidate) return originalBlock;

  const imageLineMatch = originalBlock.match(/images:\s*wmCard\((["'][^"']+["'])\)/);
  const imageArg = imageLineMatch ? imageLineMatch[1] : quote(id);
  const budgets = pickBudgets(candidate);
  const tags = pickTags(candidate).map((tag) => quote(tag)).join(', ');
  const highlights = pickHighlights(candidate).map((text) => quote(text)).join(', ');

  return [
    '  {',
    `    id: ${quote(id)},`,
    `    name: ${quote(normalizeName(candidate))},`,
    `    englishName: ${quote(normalizeEnglishName(candidate))},`,
    '    aliases: [],',
    `    country: ${quote(candidate.country || '—')},`,
    `    city: ${quote(candidate.city || '—')},`,
    `    region: ${quote(candidate.region || '—')},`,
    `    category: ${quote(pickCategory(candidate))},`,
    `    grade: ${quote(pickGrade(candidate))},`,
    `    lat: ${candidate.lat},`,
    `    lng: ${candidate.lng},`,
    `    tagline: ${quote(buildTagline(candidate))},`,
    '    description:',
    `      ${quote(buildDescription(candidate))},`,
    `    bestSeason: ${quote(pickSeason(candidate))},`,
    `    tags: [${tags}],`,
    `    highlights: [${highlights}],`,
    `    images: wmCard(${imageArg}),`,
    `    ticketCny: ${budgets.ticketCny},`,
    `    stayCny: ${budgets.stayCny},`,
    `    mealCny: ${budgets.mealCny},`,
    '  },',
  ].join('\n');
};

let nextText = dataText;
const ids = [...dataText.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);

for (const id of ids) {
  const pattern = new RegExp(`  \\{\\n    id: "${escapeRegExp(id)}",[\\s\\S]*?\\n  \\},`, 'm');
  const match = nextText.match(pattern);
  if (!match) continue;
  nextText = nextText.replace(pattern, polishBlock(id, match[0]));
}

fs.writeFileSync(DATA_PATH, nextText, 'utf8');

console.log(JSON.stringify({ polished: true, ids: ids.length }, null, 2));
