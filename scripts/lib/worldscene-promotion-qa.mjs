import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './worldscene-candidates-core.mjs';
import { DISPLAY_NAME_ZH } from '../worldscene-display-name-zh-map.mjs';

const CJK_RE = /[\u3400-\u9fff]/;
const LONG_LATIN_RE = /[A-Za-z][A-Za-z\s,.'’():/-]{24,}/;

const COUNTRY_EN_TO_ZH = new Map([
  ['Albania', '阿尔巴尼亚'],
  ['Algeria', '阿尔及利亚'],
  ['Angola', '安哥拉'],
  ['Argentina', '阿根廷'],
  ['Armenia', '亚美尼亚'],
  ['Australia', '澳大利亚'],
  ['Austria', '奥地利'],
  ['Azerbaijan', '阿塞拜疆'],
  ['Bangladesh', '孟加拉国'],
  ['Belgium', '比利时'],
  ['Belize', '伯利兹'],
  ['Bosnia and Herzegovina', '波黑'],
  ['Brazil', '巴西'],
  ['Bulgaria', '保加利亚'],
  ['Cambodia', '柬埔寨'],
  ['Canada', '加拿大'],
  ['Chile', '智利'],
  ['China', '中国'],
  ['Colombia', '哥伦比亚'],
  ['Costa Rica', '哥斯达黎加'],
  ['Croatia', '克罗地亚'],
  ['Cuba', '古巴'],
  ['Czech Republic', '捷克'],
  ['Democratic Republic of the Congo', '刚果（金）'],
  ['Dominica', '多米尼克'],
  ['Ecuador', '厄瓜多尔'],
  ['Egypt', '埃及'],
  ['Ethiopia', '埃塞俄比亚'],
  ['France', '法国'],
  ['Germany', '德国'],
  ['Greece', '希腊'],
  ['Greenland', '格陵兰'],
  ['Guatemala', '危地马拉'],
  ['Haiti', '海地'],
  ['Honduras', '洪都拉斯'],
  ['India', '印度'],
  ['Indonesia', '印度尼西亚'],
  ['Iran', '伊朗'],
  ['Iraq', '伊拉克'],
  ['Ireland', '爱尔兰'],
  ['Israel', '以色列'],
  ['Italy', '意大利'],
  ['Japan', '日本'],
  ['Jordan', '约旦'],
  ['Kazakhstan', '哈萨克斯坦'],
  ['Kenya', '肯尼亚'],
  ['Kyrgyzstan', '吉尔吉斯斯坦'],
  ['Libya', '利比亚'],
  ['Madagascar', '马达加斯加'],
  ['Malawi', '马拉维'],
  ['Malaysia', '马来西亚'],
  ['Malta', '马耳他'],
  ['Mauritania', '毛里塔尼亚'],
  ['Mauritius', '毛里求斯'],
  ['Mexico', '墨西哥'],
  ['Mongolia', '蒙古国'],
  ['Morocco', '摩洛哥'],
  ['Nepal', '尼泊尔'],
  ['Netherlands', '荷兰'],
  ['New Zealand', '新西兰'],
  ['Niger', '尼日尔'],
  ['Norway', '挪威'],
  ['Oman', '阿曼'],
  ['Pakistan', '巴基斯坦'],
  ['Palau', '帕劳'],
  ['Paraguay', '巴拉圭'],
  ['Peru', '秘鲁'],
  ['Philippines', '菲律宾'],
  ['Portugal', '葡萄牙'],
  ['Romania', '罗马尼亚'],
  ['Russia', '俄罗斯'],
  ['Samoa', '萨摩亚'],
  ['Saudi Arabia', '沙特阿拉伯'],
  ['Serbia', '塞尔维亚'],
  ['Seychelles', '塞舌尔'],
  ['Spain', '西班牙'],
  ['Sri Lanka', '斯里兰卡'],
  ['Sweden', '瑞典'],
  ['Switzerland', '瑞士'],
  ['Syria', '叙利亚'],
  ['Taiwan', '中国台湾'],
  ['Tanzania', '坦桑尼亚'],
  ['Thailand', '泰国'],
  ['Tunisia', '突尼斯'],
  ['Turkey', '土耳其'],
  ['Ukraine', '乌克兰'],
  ['United Kingdom', '英国'],
  ['United States', '美国'],
  ['Uzbekistan', '乌兹别克斯坦'],
  ['Venezuela', '委内瑞拉'],
  ['Vietnam', '越南'],
  ['West Bank', '约旦河西岸'],
  ['Zambia', '赞比亚'],
  ["People's Republic of China", '中国'],
]);

const DISPLAY_NAME_OVERRIDES = new Map([
  ['bogani-nani-wartabone-national-park-gorontalo', '博加尼纳尼瓦塔博内国家公园'],
  ['boukornine-national-park-nabeul-governorate', '布科宁国家公园'],
  ['bunya-mountains-national-park-queensland', '布尼亚山国家公园'],
  ['burren-national-park-county-clare', '巴伦国家公园'],
  ['cabrera-national-park-palma', '卡布雷拉群岛国家公园'],
  ['cabrits-national-park-dominica', '卡布里茨国家公园'],
  ['aberdare-national-park-kenya', '阿伯德尔国家公园'],
  ['alberto-de-agostini-national-park-magallanes-province', '阿尔韦托德阿戈斯蒂尼国家公园'],
  ['barbilla-national-park-turrialba-canton', '巴尔比利亚国家公园'],
  ['bicuari-national-park-huila-province', '比夸里国家公园'],
  ['blue-lagoon-national-park-central-province', '蓝湖国家公园'],
  ['cahuita-national-park-cahuita', '卡维塔国家公园'],
  ['campos-gerais-national-park-parana', '坎普斯热拉斯国家公园'],
  ['caldera-de-taburiente-national-park-santa-cruz-de-tenerife-province', '塔武连特山国家公园'],
  ['calimani-national-park-mures-county', '克利马尼国家公园'],
  ['campos-amazonicos-national-park-amazonas', '坎普斯亚马逊国家公园'],
  ['canaima-national-park-bolivar', '卡奈马国家公园'],
  ['cangandala-national-park-malanje-province', '坎甘达拉国家公园'],
  ['carara-national-park-garabito-canton', '卡拉拉国家公园'],
  ['celaque-national-park-lempira-department', '塞拉克国家公园'],
  ['central-highlands-of-sri-lanka-sri-lanka', '斯里兰卡中部高地'],
  ['chambi-national-park-kasserine-governorate', '尚比国家公园'],
  ['charyn-national-park-almaty-region', '恰伦国家公园'],
  ['cabo-de-hornos-national-park-antartica-chilena-province', '合恩角国家公园'],
  ['canadian-rocky-mountain-parks-world-heritage-site-british-columbia', '加拿大落基山公园群'],
  ['cerro-cora-national-park-amambay-department', '塞罗科拉国家公园'],
  ['champagne-hillsides-houses-and-cellars-ay-champagne', '香槟山坡、酒庄和酒窖'],
  ['chapada-dos-veadeiros-national-park-goias', '韦阿代鲁斯高地国家公园'],
  ['cheile-bicazului-hasmas-national-park-romania', '比卡兹峡谷-哈什马什国家公园'],
  ['churches-of-moldavia-suceava-county', '摩尔达维亚教堂群'],
  ['cilento-vallo-di-diano-and-alburni-national-park-province-of-salerno', '奇伦托和迪亚诺河谷国家公园'],
  ['cahokia-collinsville', '卡霍基亚遗址'],
  ['cat-tien-national-park-ong-nai', '吉仙国家公园'],
  ['chu-yang-sin-national-park-vietnam', '朱杨辛国家公园'],
  ['citadel-of-erbil-erbil', '埃尔比勒城堡'],
  ['copo-national-park-copo-department', '科波国家公园'],
  ['corcovado-national-park-puntarenas-province', '科尔科瓦多国家公园'],
  ['cotopaxi-national-park-ecuador', '科托帕希国家公园'],
  ['circeo-national-park-province-of-latina', '奇尔切奥国家公园'],
  ['derbent-dagestan-oblast', '杰尔宾特'],
  ['dessau-worlitz-garden-realm-saxony-anhalt', '德绍-沃利茨园林王国'],
  ['dovrefjell-sunndalsfjella-national-park-sunndal-municipality', '多弗勒山-松达尔国家公园'],
  ['el-cocuy-national-park-arauca-department', '埃尔科库伊国家公园'],
  ['discovery-coast-atlantic-forest-reserves-bahia', '发现海岸大西洋森林保护区'],
  ['engelhardt-observatory-tatarstan', '恩格尔哈特天文台'],
  ['farallones-de-cali-national-natural-park-valle-del-cauca-department', '卡利法拉龙斯国家自然公园'],
  ['ferapontov-monastery-ferapontovo', '费拉邦托夫修道院'],
  ['forlandet-national-park-svalbard', '福兰德国家公园'],
  ['glienicke-palace-steglitz-zehlendorf', '格林尼克宫'],
  ['golden-mountains-of-altai-altai-republic', '阿尔泰金山'],
  ['gombe-national-park-kigoma-region', '贡贝国家公园'],
  ['gouraya-national-park-bejaia', '古拉亚国家公园'],
  ['great-basin-national-park-white-pine-county', '大盆地国家公园'],
  ['guatopo-national-park-guarico', '瓜托波国家公园'],
  ['gulf-of-mannar-marine-national-park-tamil-nadu', '曼纳尔湾海洋国家公园'],
  ['hidden-christian-sites-in-the-nagasaki-region-nagasaki-prefecture', '长崎地区隐藏基督教遗产'],
  ['hoang-lien-national-park-vietnam', '黄连国家公园'],
  ['ichkeul-national-park-bizerte-governorate', '伊什克尔国家公园'],
  ['ikh-bogd-uul-national-park-mongolia', '大博格多山国家公园'],
  ['islas-de-santa-fe-national-park-san-jeronimo-department', '圣菲群岛国家公园'],
  ['jebel-serj-national-park-siliana-governorate', '杰贝勒塞尔季国家公园'],
  ['jebil-national-park-kebili-governorate', '杰比勒国家公园'],
  ['kanha-national-park-madhya-pradesh', '坎哈国家公园'],
  ['ku-ring-gai-chase-national-park-broken-bay', '库灵盖蔡斯国家公园'],
  ['landscapes-of-dauria-mongolia', '达斡里亚景观'],
  ['lengwe-national-park-malawi', '伦圭国家公园'],
  ['liuwa-plain-national-park-western-province', '柳瓦平原国家公园'],
  ['llogara-national-park-albania', '洛加拉国家公园'],
  ['lomami-national-park-tshopo', '洛马米国家公园'],
  ['k-gari-fraser-coast-region', '克加里（弗雷泽岛）'],
  ['medina-of-sousse-sousse', '苏塞古城'],
  ['meru-national-park-kenya', '梅鲁国家公园'],
  ['mikumi-national-park-morogoro-region', '米库米国家公园'],
  ['minneriya-national-park-north-central-province', '明内里耶国家公园'],
  ['mochima-national-park-sucre', '莫奇马国家公园'],
  ['monfrague-national-park-caceres-province', '蒙弗拉圭国家公园'],
  ['monte-pascoal-national-park-porto-seguro', '帕斯科阿尔山国家公园'],
  ['morrocoy-national-park-municipio-silva', '莫罗科伊国家公园'],
  ['mounts-iglit-baco-national-park-philippines', '伊格利特-巴科山国家公园'],
  ['mui-ca-mau-national-park-ca-mau', '金瓯角国家公园'],
  ['munchique-national-natural-park-cauca-department', '蒙奇克国家自然公园'],
]);

const BAD_TEXT_PATTERNS = [
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
  /mine/i,
  /museum/i,
  /local/i,
  /district/i,
  /garden cemetery/i,
  /banner/i,
  /logo/i,
  /gate /i,
  /fort stevens/i,
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
  /belfry of ghent/i,
  /historic monuments of ancient kyoto/i,
  /itsukushima shrine/i,
  /film by /i,
  /species/i,
  /bird sanctuary/i,
  /church in /i,
  /street in /i,
  /monument in /i,
  /cultural heritage monument/i,
  /ruined castle/i,
];

const BAD_IMAGE_PATTERNS = [
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
  /park entrance/i,
  /front 01/i,
  /loqosu/i,
  /milli park/i,
  /strengthening partnerships/i,
];

const COT_PATTERNS = [
  /chain[-\s]?of[-\s]?thought/i,
  /\bCOT\b/i,
  /reasoning/i,
  /step by step/i,
  /let'?s think/i,
  /as an ai/i,
  /作为(?:一个)?AI/,
  /我的推理/,
  /思考过程/,
  /推理过程/,
  /我(?:会|将|需要|应该|可以)先/,
  /首先.*然后.*最后/s,
  /适合(?:进入|放进|留在|上架到)?主表/,
  /主表/,
  /上架/,
  /候选/,
];

const DUPLICATE_PATTERNS = [
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
  /buildings and architecture of bath/i,
  /bath$/i,
  /bagan/i,
  /babylon/i,
  /ayutthaya/i,
  /baalbek/i,
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
  /los glaciares/i,
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
  /lushan/i,
  /mealy mountains/i,
  /altyn-emel/i,
  /amami/i,
  /bosra/i,
  /borobudur/i,
  /ksour/i,
  /anarjohka/i,
  /xidi/i,
  /hongcun/i,
  /northern syria/i,
  /alto cariri/i,
  /altadighi/i,
  /wudang/i,
  /wutai/i,
  /amalfi coast/i,
];

export function hasCjk(value = '') {
  return CJK_RE.test(value);
}

export function isLocalCandidateImageUrl(value = '') {
  return /^\/images\/worldscene-candidates\//.test(value);
}

export function localImageExists(url) {
  if (!isLocalCandidateImageUrl(url)) return false;
  return fs.existsSync(path.join(ROOT, 'public', url.replace(/^\//, '')));
}

export function localizeCountry(country) {
  if (!country) return '';
  if (hasCjk(country)) return country;
  return COUNTRY_EN_TO_ZH.get(country) ?? '';
}

export function displayNameForCandidate(candidate) {
  if (DISPLAY_NAME_OVERRIDES.has(candidate.id)) return DISPLAY_NAME_OVERRIDES.get(candidate.id);
  if (hasCjk(candidate.name || '')) return candidate.name;
  return DISPLAY_NAME_ZH[candidate.id] || '';
}

export function candidateTextBlob(candidate, image) {
  return [
    candidate.id,
    candidate.name,
    candidate.englishName,
    candidate.summary,
    candidate.descriptionEn,
    candidate.city,
    candidate.country,
    image?.title,
    image?.pageTitle,
  ]
    .filter(Boolean)
    .join(' | ');
}

function qualityTextBlob(candidate, image) {
  return [
    candidate.id,
    candidate.name,
    candidate.englishName,
    candidate.summary,
    candidate.descriptionEn,
    image?.title,
    image?.pageTitle,
  ]
    .filter(Boolean)
    .join(' | ');
}

export function pickLocalLeadImage(images = []) {
  return images
    .filter((image) => isLocalCandidateImageUrl(image.url || ''))
    .filter((image) => localImageExists(image.url))
    .filter((image) => !BAD_IMAGE_PATTERNS.some((regex) => regex.test(`${image.title || ''} ${image.pageTitle || ''}`)))
    .filter((image) => !image.width || image.width >= 900)
    .filter((image) => !image.height || image.height >= 600)
    .sort((left, right) => {
      const leftScore = (left.score || 0) + (left.width || 0) / 1000 + (left.height || 0) / 1000;
      const rightScore = (right.score || 0) + (right.width || 0) / 1000 + (right.height || 0) / 1000;
      return rightScore - leftScore;
    })[0] ?? null;
}

export function validatePromotionInput(candidate, manifestEntry, existingIds = new Set()) {
  const reasons = [];
  const image = pickLocalLeadImage(manifestEntry?.images ?? []);
  const zhName = displayNameForCandidate(candidate);
  const zhCountry = localizeCountry(candidate.country);
  const blob = qualityTextBlob(candidate, image);

  if (existingIds.has(candidate.id)) reasons.push('duplicate-existing-id');
  if (!zhName) reasons.push('missing-chinese-name');
  if (!zhCountry) reasons.push('missing-chinese-country');
  if (!hasCjk(candidate.region || '')) reasons.push('missing-chinese-region');
  if (!hasCjk(candidate.category || '')) reasons.push('missing-chinese-category');
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) reasons.push('missing-coordinates');
  if (!image) reasons.push('missing-valid-local-image');
  if (BAD_TEXT_PATTERNS.some((regex) => regex.test(blob))) reasons.push('bad-poi-text-pattern');
  if (DUPLICATE_PATTERNS.some((regex) => regex.test(blob))) reasons.push('known-duplicate-pattern');

  return {
    ok: reasons.length === 0,
    reasons,
    image,
    zhName,
    zhCountry,
  };
}

export function validatePublishedDraft(draft) {
  const reasons = [];
  const chineseFields = [
    ['name', draft.name],
    ['country', draft.country],
    ['city', draft.city],
    ['region', draft.region],
    ['category', draft.category],
    ['tagline', draft.tagline],
    ['description', draft.description],
    ['bestSeason', draft.bestSeason],
    ['tags', (draft.tags || []).join(' ')],
    ['highlights', (draft.highlights || []).join(' ')],
  ];

  for (const [field, value] of chineseFields) {
    if (!hasCjk(value || '')) reasons.push(`${field}:missing-cjk`);
  }

  for (const [field, value] of chineseFields) {
    if (LONG_LATIN_RE.test(value || '')) reasons.push(`${field}:long-latin`);
  }

  const copyBlob = [
    draft.tagline,
    draft.description,
    ...(draft.tags || []),
    ...(draft.highlights || []),
  ].join('\n');
  if (COT_PATTERNS.some((regex) => regex.test(copyBlob))) reasons.push('cot-or-internal-copy-leak');

  if (!Array.isArray(draft.images) || draft.images.length === 0) {
    reasons.push('missing-images');
  } else {
    for (const image of draft.images) {
      if (!isLocalCandidateImageUrl(image.url || '')) reasons.push('image-not-local');
      if (!localImageExists(image.url || '')) reasons.push('image-file-missing');
      if (BAD_IMAGE_PATTERNS.some((regex) => regex.test(`${image.title || ''} ${image.pageTitle || ''}`))) {
        reasons.push('bad-image-pattern');
      }
    }
  }

  return {
    ok: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
  };
}
