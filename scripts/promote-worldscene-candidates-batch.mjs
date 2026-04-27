import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_TS,
  ROOT,
} from './lib/worldscene-candidates-core.mjs';
import {
  displayNameForCandidate,
  localizeCountry,
  validatePromotionInput,
  validatePublishedDraft,
} from './lib/worldscene-promotion-qa.mjs';

const args = process.argv.slice(2);
const COUNT = Number(args.find((arg) => /^\d+$/.test(arg)) || 200);
const APPLY = args.includes('--apply');

const GALLERY_PATH = path.join(ROOT, 'src', 'lib', 'worldsceneCandidateGallery.ts');
const CANDIDATES_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');
const MANIFEST_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-poi-manifest.json');

const goodProminence = new Set(['world-famous', 'international', 'national']);
const DUPLICATE_SELECTION_KEYS = [
  { pattern: /borobudur/i, key: 'borobudur' },
];

const quote = (value) => JSON.stringify(value ?? '', null, 0);

const selectionKey = (item) => {
  const text = [
    item.draft.englishName,
    item.candidate.englishName,
    item.candidate.name,
    item.id,
  ].filter(Boolean).join(' ');
  const duplicate = DUPLICATE_SELECTION_KEYS.find(({ pattern }) => pattern.test(text));
  return duplicate?.key || item.id;
};

const strictScore = (candidate, image) => {
  let score = 0;
  if (candidate.prominence === 'world-famous') score += 100;
  if (candidate.prominence === 'international') score += 70;
  if (candidate.prominence === 'national') score += 40;
  if ((image.score || 0) >= 300) score += 20;
  if ((image.width || 0) >= 3000) score += 10;
  if ((image.height || 0) >= 2000) score += 10;
  if ((candidate.tags || []).includes('UNESCO')) score += 8;
  if ((candidate.category || '').includes('自然')) score += 5;
  return score;
};

const pickGrade = (candidate) => {
  if (candidate.prominence === 'world-famous') return '5A';
  return '精品';
};

const pickSeason = (candidate) => {
  const blob = [candidate.summary, candidate.descriptionEn, candidate.englishName]
    .filter(Boolean)
    .join(' ');
  if (/desert|oasis|sahara|arab/i.test(blob)) return '10-4 月';
  if (/arctic|northern|labrador|greenland/i.test(blob)) return '6-9 月';
  if (/rainforest|tropical|island|amazon/i.test(blob)) return '5-11 月';
  return '4-10 月';
};

const pickBudgets = (candidate) => {
  const blob = [candidate.country, candidate.englishName, candidate.summary]
    .filter(Boolean)
    .join(' ');
  if (/Greenland|Norway|Sweden|Switzerland|United Kingdom|France|Germany|Japan|Canada/i.test(blob)) {
    return { ticketCny: 100, stayCny: 520, mealCny: 180 };
  }
  if (/China|People's Republic of China|Bangladesh|Mauritania|Syria|Peru|Jordan|Oman|Morocco|Kazakhstan|Brazil/i.test(blob)) {
    return { ticketCny: 60, stayCny: 320, mealCny: 120 };
  }
  return { ticketCny: 80, stayCny: 420, mealCny: 150 };
};

const pickTags = (candidate, zhCountry) => {
  const tags = [];
  if ((candidate.category || '').includes('自然')) tags.push('自然景观');
  else if ((candidate.category || '').includes('城市')) tags.push('城市地标');
  else if ((candidate.category || '').includes('海岛')) tags.push('海岛度假');
  else tags.push('人文古迹');

  if ((candidate.tags || []).includes('UNESCO')) tags.push('世界遗产');
  if (/National Park/i.test(candidate.englishName || '')) tags.push('国家公园');
  if (/archaeological|archaeology/i.test(candidate.summary || '')) tags.push('考古遗址');
  if (/cathedral|church|abbey|monastery/i.test(candidate.summary || '')) tags.push('宗教建筑');
  if (tags.length < 3 && zhCountry) tags.push(zhCountry);
  return Array.from(new Set(tags)).slice(0, 3);
};

const pickHighlights = (candidate) => {
  if ((candidate.category || '').includes('自然')) {
    return ['景观主体清晰', '空间层次鲜明', '适合地球视角浏览'];
  }
  if ((candidate.category || '').includes('城市')) {
    return ['地标形态明确', '城市关系清晰', '适合路线串联'];
  }
  if ((candidate.category || '').includes('海岛')) {
    return ['海岸线辨识度高', '度假氛围突出', '适合图像化呈现'];
  }
  return ['历史主题明确', '遗存轮廓清晰', '适合文化线路串联'];
};

const buildTagline = (candidate, zhName) => {
  if ((candidate.category || '').includes('自然')) {
    return `${zhName}以清晰的自然轮廓和稳定的视觉主体见长，适合在地球视角中作为独立目的地浏览。`;
  }
  if ((candidate.category || '').includes('城市')) {
    return `${zhName}具备明确的城市地标形态，适合与周边街区、天际线或公共空间一起呈现。`;
  }
  if ((candidate.category || '').includes('海岛')) {
    return `${zhName}的海岸线、水色和岛屿空间关系鲜明，适合补充海岛度假类目的地。`;
  }
  return `${zhName}拥有清楚可读的历史遗存和文化主题，适合作为人文古迹类目的地展示。`;
};

const buildDescription = (candidate, zhName) => {
  if ((candidate.category || '').includes('自然')) {
    return `${zhName}的地貌或生态特征相对集中，画面结构容易辨认。它可以补充现有景点库中的自然样本，让用户在缩放浏览时更容易比较不同地区的地景差异。`;
  }
  if ((candidate.category || '').includes('城市')) {
    return `${zhName}的城市尺度和视觉边界比较清楚，适合和路线规划、周边浏览结合起来看。它能为地球项目补充更具体的都会目的地。`;
  }
  if ((candidate.category || '').includes('海岛')) {
    return `${zhName}的海水、岸线和度假场景辨识度较高，适合与其他海岛或滨海目的地并列呈现，形成更丰富的海岸样本。`;
  }
  return `${zhName}的遗存格局和文化背景比较完整，能够支撑独立浏览，也适合纳入更大尺度的历史文化线路中。`;
};

const buildDraft = (candidate, image, qa) => {
  const zhName = qa.zhName || displayNameForCandidate(candidate);
  const zhCountry = qa.zhCountry || localizeCountry(candidate.country);
  const nameBlob = `${candidate.id} ${candidate.englishName || ''} ${candidate.name || ''}`;
  const city = candidate.city && /[\u3400-\u9fff]/.test(candidate.city)
    ? candidate.city
    : '周边地区';
  const category = candidate.category && /[\u3400-\u9fff]/.test(candidate.category)
    ? candidate.category
    : '人文古迹';
  const normalizedCategory = /national park|national natural park|national forest park|rocky mountain parks|highlands|forest reserves|landscapes|coast|mountains|k'gari|fraser|canaima|chamonix/i.test(nameBlob)
    ? '自然景观'
    : category;
  const budgets = pickBudgets(candidate);

  return {
    id: candidate.id,
    name: zhName,
    englishName: candidate.englishName || candidate.name,
    aliases: [],
    country: zhCountry,
    city,
    region: candidate.region,
    category: normalizedCategory,
    grade: pickGrade(candidate),
    lat: candidate.lat,
    lng: candidate.lng,
    tagline: buildTagline({ ...candidate, category: normalizedCategory }, zhName),
    description: buildDescription({ ...candidate, category: normalizedCategory }, zhName),
    bestSeason: pickSeason(candidate),
    tags: pickTags({ ...candidate, category: normalizedCategory }, zhCountry),
    highlights: pickHighlights({ ...candidate, category: normalizedCategory }),
    images: [image],
    ...budgets,
  };
};

const renderGalleryBlock = (item) => {
  const image = item.image;
  const lines = [
    `  '${item.id}': {`,
    `    images: [`,
    `      {`,
    `        url: ${quote(image.url)},`,
    `        source: ${quote(image.source)},`,
    `        title: ${quote(image.title)},`,
    `        pageTitle: ${quote(image.pageTitle)},`,
    `        score: ${image.score || 0},`,
  ];
  if (image.width) lines.push(`        width: ${image.width},`);
  if (image.height) lines.push(`        height: ${image.height},`);
  lines.push(`      },`, `    ],`, `  },`);
  return lines.join('\n');
};

const renderDataBlock = (item) => {
  const draft = item.draft;
  return [
    `  {`,
    `    id: ${quote(draft.id)},`,
    `    name: ${quote(draft.name)},`,
    `    englishName: ${quote(draft.englishName)},`,
    `    aliases: [],`,
    `    country: ${quote(draft.country)},`,
    `    city: ${quote(draft.city)},`,
    `    region: ${quote(draft.region)},`,
    `    category: ${quote(draft.category)},`,
    `    grade: ${quote(draft.grade)},`,
    `    lat: ${draft.lat},`,
    `    lng: ${draft.lng},`,
    `    tagline: ${quote(draft.tagline)},`,
    `    description:`,
    `      ${quote(draft.description)},`,
    `    bestSeason: ${quote(draft.bestSeason)},`,
    `    tags: [${draft.tags.map((tag) => quote(tag)).join(', ')}],`,
    `    highlights: [${draft.highlights.map((text) => quote(text)).join(', ')}],`,
    `    images: wmCard(${quote(draft.id)}),`,
    `    ticketCny: ${draft.ticketCny},`,
    `    stayCny: ${draft.stayCny},`,
    `    mealCny: ${draft.mealCny},`,
    `  },`,
  ].join('\n');
};

const rawCandidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
const candidates = rawCandidates.entries;
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const dataText = fs.readFileSync(DATA_TS, 'utf8');
const galleryText = fs.readFileSync(GALLERY_PATH, 'utf8');

const existing = new Set([...dataText.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
const chosen = [];
const rejected = new Map();

const reject = (reason) => rejected.set(reason, (rejected.get(reason) || 0) + 1);

for (const candidate of candidates) {
  if (!goodProminence.has(candidate.prominence)) {
    reject('weak-prominence');
    continue;
  }

  const qa = validatePromotionInput(candidate, manifest[candidate.id], existing);
  if (!qa.ok) {
    qa.reasons.forEach(reject);
    continue;
  }

  const draft = buildDraft(candidate, qa.image, qa);
  const draftQa = validatePublishedDraft(draft);
  if (!draftQa.ok) {
    draftQa.reasons.forEach(reject);
    continue;
  }

  chosen.push({
    id: candidate.id,
    candidate,
    image: qa.image,
    draft,
    score: strictScore(candidate, qa.image),
  });
}

const selected = [];
const selectedKeys = new Set();
for (const item of chosen.sort((a, b) => b.score - a.score || a.draft.englishName.localeCompare(b.draft.englishName))) {
  const key = selectionKey(item);
  if (selectedKeys.has(key)) {
    reject('duplicate-selection-key');
    continue;
  }
  selectedKeys.add(key);
  selected.push(item);
  if (selected.length >= COUNT) break;
}

const summary = {
  mode: APPLY ? 'apply' : 'dry-run',
  requested: COUNT,
  eligible: chosen.length,
  selected: selected.length,
  rejected: Object.fromEntries([...rejected.entries()].sort((a, b) => b[1] - a[1])),
  examples: selected.slice(0, 20).map((item) => ({
    id: item.id,
    zh: item.draft.name,
    en: item.draft.englishName,
    country: item.draft.country,
    image: item.image.url,
  })),
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  console.log('Dry run only. Re-run with --apply to write worldsceneData.ts and worldsceneCandidateGallery.ts.');
  process.exit(0);
}

if (selected.length < COUNT) {
  throw new Error(`Only selected ${selected.length} candidates, expected ${COUNT}.`);
}

const galleryInsertion = `${selected.map(renderGalleryBlock).join('\n')}\n`;
const dataInsertion = `${selected.map(renderDataBlock).join('\n')}\n`;

const galleryMarker = '\n};\n';
const dataMarker = '\n];\n\nexport const ORIGIN_PRESETS';

if (!galleryText.includes(galleryMarker)) throw new Error('Could not find gallery insertion marker.');
if (!dataText.includes(dataMarker)) throw new Error('Could not find data insertion marker.');

const nextGallery = galleryText.replace(galleryMarker, `\n${galleryInsertion}};\n`);
const nextData = dataText.replace(dataMarker, `\n${dataInsertion}];\n\nexport const ORIGIN_PRESETS`);

fs.writeFileSync(GALLERY_PATH, nextGallery, 'utf8');
fs.writeFileSync(DATA_TS, nextData, 'utf8');
console.log(JSON.stringify(summary, null, 2));
