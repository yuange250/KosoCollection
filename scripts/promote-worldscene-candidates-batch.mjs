import fs from 'node:fs';

const COUNT = Number(process.argv[2] || 200);

const DATA_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneData.ts';
const GALLERY_PATH = 'C:/codes/KosoCollection/src/lib/worldsceneCandidateGallery.ts';
const CANDIDATES_PATH = 'C:/codes/KosoCollection/data/worldscene/candidate-pois.json';
const MANIFEST_PATH = 'C:/codes/KosoCollection/data/worldscene/candidate-poi-manifest.json';

const hasCJK = (value = '') => /[\u3400-\u9fff]/.test(value);

const badText = [
  /castle ruin/i,
  /burgruine/i,
  /burgstall/i,
  /cemetery/i,
  /memorial/i,
  /chapel/i,
  /casa /i,
  /house /i,
  /bridge/i,
  /river/i,
  /hill/i,
  /mine/i,
  /museum/i,
  /local/i,
  /district/i,
  /garden cemetery/i,
  /banner/i,
  /logo/i,
  /fortress/i,
  /gate /i,
  /palace treasury/i,
  /chapel of/i,
  /theatre/i,
  /old town/i,
  /historic city/i,
  /historic centre/i,
  /avenue/i,
  /cathedral treasury/i,
  /park entrance/i,
  /building in /i,
  /township in /i,
  /film by /i,
  /species/i,
  /bird sanctuary/i,
  /church in /i,
  /street in /i,
  /monument in /i,
  /cultural heritage monument/i,
  /ruined castle/i,
];

const badImg = [
  /logo/i,
  /map/i,
  /badge/i,
  /flag/i,
  /poster/i,
  /coat of arms/i,
  /emblem/i,
  /interior/i,
  /entrance/i,
  /banner/i,
  /iss/i,
  /drone shots of .*park/i,
  /kakum/i,
  /park entrance/i,
  /front 01/i,
  /loqosu/i,
  /milli park/i,
  /strengthening partnerships/i,
];

const dup = [
  /victoria falls/i,
  /prague/i,
  /toledo/i,
  /segovia/i,
  /zacatecas/i,
  /san gimignano/i,
  /sado/i,
  /alhambra/i,
  /pamukkale/i,
  /jiuzhaigou/i,
  /louvre/i,
  /dubrovnik/i,
  /giza/i,
  /marina bay/i,
  /uluru/i,
  /shibuya/i,
  /berlin/i,
  /cusco/i,
  /aachen/i,
  /a-ma temple/i,
  /agra fort/i,
  /bath$/i,
  /bagan/i,
  /babylon/i,
  /ayutthaya/i,
  /baalbek/i,
  /bahla/i,
  /batalha/i,
  /ping yao/i,
  /antigua/i,
  /anjar/i,
  /ani$/i,
  /acre$/i,
  /abel tasman/i,
  /abisko/i,
  /amboseli/i,
  /angkor/i,
  /anuradhapura/i,
  /morne seychellois/i,
  /nikko/i,
  /verona/i,
  /palace of mafra/i,
  /danube delta/i,
  /calanques/i,
  /channel islands/i,
  /kluane/i,
  /isle royale/i,
  /grand pre/i,
  /semuc champey/i,
  /semmering/i,
  /hiraizumi/i,
  /jantar mantar/i,
  /jesuit missions of la santisima trinidad/i,
  /caserta/i,
  /saint-savin/i,
  /abruzzo/i,
  /aflaj/i,
  /ahwar/i,
  /aigai/i,
  /aiguestortes/i,
  /ait ben/i,
  /amber mountain/i,
  /ambohimanga/i,
  /aasivissuit/i,
  /air and t[eé]n[eé]r[eé]/i,
  /al-ahsa/i,
  /al hoceima/i,
  /al maghtas/i,
  /alta murgia/i,
  /alto douro/i,
  /anavilhanas/i,
  /ainos/i,
  /mealy mountains/i,
  /altyn-emel/i,
  /amami/i,
  /bosra/i,
  /ksour/i,
  /anarjohka/i,
  /xidi/i,
  /hongcun/i,
  /northern syria/i,
  /alto cariri/i,
  /altadighi/i,
  /wudang/i,
  /amalfi coast/i,
];

const goodProminence = new Set(['world-famous', 'international', 'national']);

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

const quote = (value) => JSON.stringify(value ?? '', null, 0);

const pickGrade = (candidate) => {
  if (candidate.prominence === 'world-famous') return '5A';
  return '精品';
};

const pickSeason = (candidate) => {
  const blob = [candidate.summary, candidate.descriptionEn, candidate.englishName].filter(Boolean).join(' ');
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
  if (/China|People's Republic of China|Bangladesh|Mauritania|Syria|Peru|Jordan|Oman|Morocco|Kazakhstan|Brazil/i.test(blob)) {
    return { ticketCny: 60, stayCny: 320, mealCny: 120 };
  }
  return { ticketCny: 80, stayCny: 420, mealCny: 150 };
};

const pickTags = (candidate) => {
  const tags = [];
  if ((candidate.category || '').includes('自然')) {
    tags.push('自然景观');
  } else {
    tags.push('人文古迹');
  }
  if ((candidate.tags || []).includes('UNESCO')) tags.push('UNESCO');
  if ((candidate.englishName || '').match(/National Park/i)) tags.push('国家公园');
  if ((candidate.summary || '').match(/archaeological|archaeology/i)) tags.push('考古遗址');
  if ((candidate.summary || '').match(/cathedral|church|abbey|monastery/i)) tags.push('宗教建筑');
  if (tags.length < 3 && candidate.country) tags.push(candidate.country);
  return Array.from(new Set(tags)).slice(0, 3);
};

const pickHighlights = (candidate) => {
  const natural = ['景观辨识度高', '首图主体明确', '适合独立成点'];
  const human = ['历史辨识度强', '主体建筑明确', '适合独立成点'];
  return (candidate.category || '').includes('自然') ? natural : human;
};

const buildTagline = (candidate) => {
  if ((candidate.category || '').includes('自然')) {
    return `${candidate.englishName} offers a distinct landscape profile with clear visual identity and destination value.`;
  }
  return `${candidate.englishName} stands out as a clearly legible heritage destination with strong site identity.`;
};

const buildDescription = (candidate) => {
  if ((candidate.category || '').includes('自然')) {
    return `${candidate.englishName} deserves promotion because its scenery is specific, readable at a glance, and different enough from the current main-table landscape clusters.`;
  }
  return `${candidate.englishName} deserves promotion because it can stand on its own as a formal heritage destination instead of depending on a larger parent city or broader cluster.`;
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
  const budgets = pickBudgets(item.candidate);
  const tags = pickTags(item.candidate).map((tag) => quote(tag)).join(', ');
  const highlights = pickHighlights(item.candidate).map((text) => quote(text)).join(', ');
  const aliases = [];
  return [
    `  {`,
    `    id: ${quote(item.id)},`,
    `    name: ${quote(item.candidate.name || item.candidate.englishName)},`,
    `    englishName: ${quote(item.candidate.englishName || item.candidate.name)},`,
    `    aliases: [${aliases.join(', ')}],`,
    `    country: ${quote(item.candidate.country || '—')},`,
    `    city: ${quote(item.candidate.city || '—')},`,
    `    region: ${quote(item.candidate.region || '—')},`,
    `    category: ${quote(item.candidate.category || '人文古迹')},`,
    `    grade: ${quote(pickGrade(item.candidate))},`,
    `    lat: ${item.candidate.lat},`,
    `    lng: ${item.candidate.lng},`,
    `    tagline: ${quote(buildTagline(item.candidate))},`,
    `    description:`,
    `      ${quote(buildDescription(item.candidate))},`,
    `    bestSeason: ${quote(pickSeason(item.candidate))},`,
    `    tags: [${tags}],`,
    `    highlights: [${highlights}],`,
    `    images: wmCard(${quote(item.id)}),`,
    `    ticketCny: ${budgets.ticketCny},`,
    `    stayCny: ${budgets.stayCny},`,
    `    mealCny: ${budgets.mealCny},`,
    `  },`,
  ].join('\n');
};

const rawCandidates = JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8'));
const candidates = rawCandidates.entries;
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const dataText = fs.readFileSync(DATA_PATH, 'utf8');
const galleryText = fs.readFileSync(GALLERY_PATH, 'utf8');

const existing = new Set([...dataText.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]));
const chosen = [];

for (const candidate of candidates) {
  if (existing.has(candidate.id)) continue;
  if (!hasCJK(candidate.name || '')) continue;
  if (!goodProminence.has(candidate.prominence)) continue;
  const manifestEntry = manifest[candidate.id];
  if (!manifestEntry?.images?.length) continue;
  const image = manifestEntry.images[0];
  const blob = [
    candidate.name,
    candidate.englishName,
    candidate.summary,
    candidate.descriptionEn,
    candidate.city,
    candidate.country,
    image.title,
    image.pageTitle,
  ]
    .filter(Boolean)
    .join(' | ');

  if (badText.some((regex) => regex.test(blob))) continue;
  if (dup.some((regex) => regex.test(blob))) continue;
  if (badImg.some((regex) => regex.test(image.title || ''))) continue;
  if ((image.width && image.width < 1100) || (image.height && image.height < 700)) continue;

  chosen.push({
    id: candidate.id,
    candidate,
    image,
    score: strictScore(candidate, image),
  });
}

const worldFamous = chosen
  .filter((item) => item.candidate.prominence === 'world-famous')
  .sort((a, b) => b.score - a.score || a.candidate.englishName.localeCompare(b.candidate.englishName));
const national = chosen
  .filter((item) => item.candidate.prominence === 'national')
  .sort((a, b) => b.score - a.score || a.candidate.englishName.localeCompare(b.candidate.englishName));
const international = chosen
  .filter((item) => item.candidate.prominence === 'international')
  .sort((a, b) => b.score - a.score || a.candidate.englishName.localeCompare(b.candidate.englishName));

const targetWorld = Math.min(120, worldFamous.length);
const targetNational = Math.min(80, national.length);

const selected = [];
selected.push(...worldFamous.slice(0, targetWorld));
selected.push(...national.slice(0, targetNational));

if (selected.length < COUNT) {
  const already = new Set(selected.map((item) => item.id));
  const fallback = [...international, ...worldFamous.slice(targetWorld), ...national.slice(targetNational)]
    .filter((item) => !already.has(item.id))
    .sort((a, b) => b.score - a.score || a.candidate.englishName.localeCompare(b.candidate.englishName));
  selected.push(...fallback.slice(0, COUNT - selected.length));
}

const finalSelection = selected.slice(0, COUNT);

if (finalSelection.length < COUNT) {
  throw new Error(`Only selected ${finalSelection.length} candidates, expected ${COUNT}.`);
}

const galleryInsertion = `${finalSelection.map(renderGalleryBlock).join('\n')}\n`;
const dataInsertion = `${finalSelection.map(renderDataBlock).join('\n')}\n`;

const galleryMarker = '\n};\n';
const dataMarker = '\n];\n\nexport const ORIGIN_PRESETS';

if (!galleryText.includes(galleryMarker)) throw new Error('Could not find gallery insertion marker.');
if (!dataText.includes(dataMarker)) throw new Error('Could not find data insertion marker.');

const nextGallery = galleryText.replace(galleryMarker, `\n${galleryInsertion}};\n`);
const nextData = dataText.replace(dataMarker, `\n${dataInsertion}];\n\nexport const ORIGIN_PRESETS`);

fs.writeFileSync(GALLERY_PATH, nextGallery, 'utf8');
fs.writeFileSync(DATA_PATH, nextData, 'utf8');

const summary = {
  promoted: finalSelection.length,
  worldFamous: finalSelection.filter((item) => item.candidate.prominence === 'world-famous').length,
  national: finalSelection.filter((item) => item.candidate.prominence === 'national').length,
  examples: finalSelection.slice(0, 20).map((item) => ({
    id: item.id,
    zh: item.candidate.name,
    en: item.candidate.englishName,
  })),
};

console.log(JSON.stringify(summary, null, 2));
