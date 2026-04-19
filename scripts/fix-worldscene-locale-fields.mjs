/**
 * Localize English metadata, repair season/tags mojibake, normalize unicode escapes.
 * Run: node scripts/fix-worldscene-locale-fields.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_TS = path.join(__dirname, '..', 'src', 'lib', 'worldsceneData.ts');

const COUNTRY_EN_TO_ZH = {
  Albania: '阿尔巴尼亚',
  Australia: '澳大利亚',
  Austria: '奥地利',
  Azerbaijan: '阿塞拜疆',
  Bangladesh: '孟加拉国',
  Belgium: '比利时',
  Belize: '伯利兹',
  'Bosnia and Herzegovina': '波黑',
  Brazil: '巴西',
  Bulgaria: '保加利亚',
  Cambodia: '柬埔寨',
  Canada: '加拿大',
  Cuba: '古巴',
  'Czech Republic': '捷克',
  'Democratic Republic of the Congo': '刚果（金）',
  Egypt: '埃及',
  Ethiopia: '埃塞俄比亚',
  France: '法国',
  Germany: '德国',
  Greece: '希腊',
  Greenland: '格陵兰',
  Guatemala: '危地马拉',
  India: '印度',
  Indonesia: '印度尼西亚',
  Iran: '伊朗',
  Iraq: '伊拉克',
  Ireland: '爱尔兰',
  Italy: '意大利',
  Japan: '日本',
  Jordan: '约旦',
  Kazakhstan: '哈萨克斯坦',
  Kenya: '肯尼亚',
  Kyrgyzstan: '吉尔吉斯斯坦',
  Libya: '利比亚',
  Madagascar: '马达加斯加',
  Mauritania: '毛里塔尼亚',
  Mexico: '墨西哥',
  Morocco: '摩洛哥',
  Nepal: '尼泊尔',
  Netherlands: '荷兰',
  'New Zealand': '新西兰',
  Niger: '尼日尔',
  Norway: '挪威',
  Oman: '阿曼',
  Pakistan: '巴基斯坦',
  Palau: '帕劳',
  Paraguay: '巴拉圭',
  Peru: '秘鲁',
  Portugal: '葡萄牙',
  Romania: '罗马尼亚',
  Russia: '俄罗斯',
  Samoa: '萨摩亚',
  'Saudi Arabia': '沙特阿拉伯',
  Serbia: '塞尔维亚',
  Seychelles: '塞舌尔',
  Spain: '西班牙',
  'Sri Lanka': '斯里兰卡',
  Syria: '叙利亚',
  Taiwan: '中国台湾',
  Tanzania: '坦桑尼亚',
  Thailand: '泰国',
  Tunisia: '突尼斯',
  Turkey: '土耳其',
  Ukraine: '乌克兰',
  'United Kingdom': '英国',
  'United States': '美国',
  Uzbekistan: '乌兹别克斯坦',
  Venezuela: '委内瑞拉',
  Vietnam: '越南',
  'West Bank': '约旦河西岸',
  Zambia: '赞比亚',
  "People's Republic of China": '中国',
};

const REGION_EN_TO_ZH = {
  Asia: '亚洲',
  Europe: '欧洲',
  Africa: '非洲',
  Oceania: '大洋洲',
  'North America': '北美',
  'South America': '南美',
};

function escapeSq(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeCategoryGradeInText(t) {
  return t
    .replace(/category:\s*'\\u4eba\\u6587\\u53e4\\u8ff9'/g, "category: '人文古迹'")
    .replace(/category:\s*"\\u4eba\\u6587\\u53e4\\u8ff9"/g, 'category: "人文古迹"')
    .replace(/category:\s*'\\u81ea\\u7136\\u666f\\u89c2'/g, "category: '自然景观'")
    .replace(/category:\s*"\\u81ea\\u7136\\u666f\\u89c2"/g, 'category: "自然景观"')
    .replace(/category:\s*'\\u57ce\\u5e02\\u5730\\u6807'/g, "category: '城市地标'")
    .replace(/category:\s*"\\u57ce\\u5e02\\u5730\\u6807"/g, 'category: "城市地标"')
    .replace(/category:\s*'\\u6d77\\u5c9b\\u5ea6\\u5047'/g, "category: '海岛度假'")
    .replace(/category:\s*"\\u6d77\\u5c9b\\u5ea6\\u5047"/g, 'category: "海岛度假"')
    .replace(/grade:\s*'\\u7cbe\\u54c1'/g, "grade: '精品'")
    .replace(/grade:\s*"\\u7cbe\\u54c1"/g, 'grade: "精品"')
    .replace(/grade:\s*'\\u666e\\u901a'/g, "grade: '普通'");
}

function normalizeRegionEscapes(t) {
  return t
    .replace(/region:\s*"\\u4e9a\\u6d32"/g, "region: '亚洲'")
    .replace(/region:\s*"\\u6b27\\u6d32"/g, "region: '欧洲'")
    .replace(/region:\s*"\\u975e\\u6d32"/g, "region: '非洲'")
    .replace(/region:\s*"\\u5927\\u6d0b\\u6d32"/g, "region: '大洋洲'")
    .replace(/region:\s*"\\u5357\\u7f8e"/g, "region: '南美'")
    .replace(/region:\s*"\\u5317\\u7f8e"/g, "region: '北美'");
}

function localizeCountriesRegions(t) {
  let out = t;
  for (const [en, zh] of Object.entries(COUNTRY_EN_TO_ZH)) {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`country:\\s*"${esc}"`, 'g'), `country: '${zh}'`);
    out = out.replace(new RegExp(`country:\\s*'${esc}'`, 'g'), `country: '${zh}'`);
  }
  for (const [en, zh] of Object.entries(REGION_EN_TO_ZH)) {
    const esc = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`region:\\s*"${esc}"`, 'g'), `region: '${zh}'`);
    out = out.replace(new RegExp(`region:\\s*'${esc}'`, 'g'), `region: '${zh}'`);
  }
  return out;
}

function normalizeBestSeason(t) {
  let out = t;
  out = out.replace(/(\d{1,2})-(\d{1,2})\s+months/g, '$1–$2 月');
  out = out.replace(/(\d{1,2}–\d{1,2})\s+months/g, '$1 月');
  out = out.replace(/(\d{1,2}-\d{1,2})\s+months/g, '$1 月');
  out = out.replace(/(\d{1,2}-\d{1,2})\s*\/\s*(\d{1,2}-\d{1,2})\s+months/g, '$1 月 / $2 月');
  out = out.replace(/(\d{1,2}-\d{1,2})\s*\?\s*\/\s*(\d{1,2}-\d{1,2})\s*\?/g, '$1 月 / $2 月');
  out = out.replace(/(\d{1,2}-\d{1,2})\?/g, '$1 月');
  out = out.replace(/(\d{1,2})–(\d{1,2})\?/g, '$1–$2 月');
  return out;
}

function extractField(inner, field) {
  const sq = new RegExp(`\\n    ${field}:\\s*'((?:\\\\.|[^'\\\\])*)'`);
  const dq = new RegExp(`\\n    ${field}:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  let m = inner.match(sq);
  if (m) return { raw: m[0], value: unescapeJs(m[1]), quote: "'" };
  m = inner.match(dq);
  if (m) return { raw: m[0], value: unescapeJs(m[1]), quote: '"' };
  return null;
}

function extractDescription(inner) {
  const multi = /\n    description:\s*\n\s*'((?:\\.|[^'\\])*)'/;
  const multiD = /\n    description:\s*\n\s*"((?:\\.|[^"\\])*)"/;
  const oneLine = /\n    description:\s*'((?:\\.|[^'\\])*)'/;
  const oneLineD = /\n    description:\s*"((?:\\.|[^"\\])*)"/;
  let m = inner.match(multi);
  if (m)
    return {
      raw: m[0],
      value: unescapeJs(m[1]),
      multiline: true,
    };
  m = inner.match(multiD);
  if (m)
    return {
      raw: m[0],
      value: unescapeJs(m[1]),
      multiline: true,
    };
  m = inner.match(oneLine);
  if (m) return { raw: m[0], value: unescapeJs(m[1]), multiline: false };
  m = inner.match(oneLineD);
  if (m) return { raw: m[0], value: unescapeJs(m[1]), multiline: false };
  return null;
}

function unescapeJs(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n');
}

function hasLongLatin(s) {
  return /[a-zA-Z][a-zA-Z\s,.'\u2019;:-]{40,}/.test(s || '');
}

function extractName(inner) {
  const m = inner.match(/\n    name:\s*'([^']*)'/) || inner.match(/\n    name:\s*"([^"]*)"/);
  return m ? unescapeJs(m[1]) : '';
}

function extractCategory(inner) {
  const m =
    inner.match(/\n    category:\s*'([^']*)'/) || inner.match(/\n    category:\s*"([^"]*)"/);
  if (!m) return '自然景观';
  let c = unescapeJs(m[1]);
  if (!['自然景观', '人文古迹', '城市地标', '海岛度假'].includes(c)) return '自然景观';
  return c;
}

function zhTagline(name, cat) {
  const n = name || '该目的地';
  const map = {
    自然景观: `${n}地貌与空间层次清晰，适合作为自然类目的地浏览与配图。`,
    人文古迹: `${n}遗存集中、可读性强，适合作为文化遗产类目的地呈现。`,
    城市地标: `${n}在城市尺度上形体突出，适合作为都会地标与片区锚点。`,
    海岛度假: `${n}滨海层次与岸线对比鲜明，适合作为海岛度假向目的地呈现。`,
  };
  return map[cat] || map['自然景观'];
}

function zhDescription(cat) {
  const map = {
    自然景观:
      '在官方目的地库中可补强典型自然样本：尺度稳定、画面结构清楚，便于建立第一印象并与同类型目的地对照叙事。',
    人文古迹:
      '遗存格局与文化氛围较为集中，能够支撑独立浏览体验，也适合纳入更大尺度的线路或城市群叙事。',
    城市地标:
      '识别度高、边界清晰的城市尺度对象，便于与街区步行、河岸或天际线等情境组合呈现。',
    海岛度假:
      '海水层次与岛岸关系对比清晰，适合作为滨海度假样本与其它海岛或海岸目的地并列呈现。',
  };
  return map[cat] || map['自然景观'];
}

function zhTags(cat, countryZh) {
  const c = countryZh || '旅行';
  const map = {
    自然景观: ['自然风光', '保护地', c],
    人文古迹: ['文化遗产', '历史遗存', c],
    城市地标: ['城市地标', '都会景观', c],
    海岛度假: ['海岛', '滨海', c],
  };
  const arr = map[cat] || map['自然景观'];
  return `['${arr.map(escapeSq).join("', '")}']`;
}

function zhHighlights(cat) {
  const map = {
    自然景观: `['代表性景观', '空间层次清晰', '适合专题呈现']`,
    人文古迹: `['遗存整体氛围', '文化识别度', '可与周边联动']`,
    城市地标: `['地标形体', '街区关系', '易于辨认']`,
    海岛度假: `['海水层次', '岸线形态', '度假氛围']`,
  };
  return map[cat] || map['自然景观'];
}

const EARLY_PATCH = {
  'angkor-siem-reap-province': {
    aliases: `['吴哥窟', '吴哥通王城', '高棉寺庙群']`,
    country: '柬埔寨',
    city: '暹粒省',
    region: '亚洲',
    tagline: '塔庙、蓄水池与御道叠加成片的帝国圣城，东南亚识别度极高的文化地标。',
    description:
      '吴哥不仅是单座寺庙，而是一整片帝制圣景：多层台基、水池、引道与石塔共同构成可叙事的空间序列，很适合做地图与尺度关系展示。',
    bestSeason: '11 月 — 翌年 2 月',
    tags: `['世界遗产', '寺庙群', '古迹聚落']`,
    highlights: `['吴哥窟', '巴戎寺', '通王城与引道']`,
  },
  'anuradhapura-anuradhapura-district': {
    aliases: `['阿努拉德普勒圣城', '斯里兰卡古都']`,
    country: '斯里兰卡',
    city: '阿努拉德普勒地区',
    region: '亚洲',
    tagline: '白塔、圣树与僧院废墟叠合成南亚最清晰的「圣城」地表之一。',
    description:
      '作为官方点，它同时具备古城格局与仍在延续的信仰空间：大塔、水库、寺院与祭礼场所形成开阔的宗教—城市肌理，而非单点遗址。',
    bestSeason: '12 月 — 翌年 3 月',
    tags: `['世界遗产', '佛教圣城', '古都遗址']`,
    highlights: `['鲁万韦利萨亚大塔', '古城池与僧院遗迹', '圣菩提林']`,
  },
  'aoraki-mount-cook-national-park-mackenzie-district': {
    aliases: `['库克山', '奥拉基山', '新西兰高山公园']`,
    country: '新西兰',
    city: '麦肯齐地区',
    region: '大洋洲',
    tagline: '雪峰、冰川与开阔高山谷地，大洋洲最具辨识度的山地轮廓之一。',
    description:
      '补全官方库中「高海拔山地+冰川」类型：雪线、冰斗与裸露谷地形成的对比，足以和雨林岛链、海岸城市形成清晰差异。',
    bestSeason: '11 月 — 翌年 3 月',
    tags: `['国家公园', '冰川', '高山徒步']`,
    highlights: `['库克山脊线', '冰川谷地', '山景徒步视域']`,
  },
  'aphrodisias-karacasu': {
    aliases: `['阿佛洛狄西亚', '罗马雕塑之城']`,
    country: '土耳其',
    city: '卡拉贾苏',
    region: '亚洲',
    tagline: '四门坊、石柱与雕塑遗存让这座地中海古典城址读得格外清楚。',
    description:
      '相对一般罗马遗址，这里的建筑与雕塑一体化程度更高，适合作为「艺术向」古代城点，而不只是大面积的碎柱场。',
    bestSeason: '4–6 月 / 9–10 月',
    tags: `['世界遗产', '古罗马', '雕塑遗存']`,
    highlights: `['四门坊', '柱列与剧场', '城市石工与雕塑']`,
  },
  'ancient-city-of-nessebar-nesebar': {
    aliases: `['内塞巴尔', '黑海老城']`,
    country: '保加利亚',
    city: '内塞巴尔',
    region: '欧洲',
    tagline: '半岛上的石巷与教堂立面，在近海尺度里一眼可读的海滨古城样本。',
    description:
      '作为「滨海老城」类型，它比内陆堡垒城多出海岬形态、港湾边线与密集的小教堂天际线，很适合做滨水历史街区叙事。',
    bestSeason: '5–6 月 / 9–10 月',
    tags: `['世界遗产', '海滨老城', '教堂群']`,
    highlights: `['半岛古城格局', '历史教堂立面', '黑海港景']`,
  },
  'archaeological-ensemble-of-merida-merida': {
    aliases: `['梅里达', '罗马梅里达']`,
    country: '西班牙',
    city: '梅里达',
    region: '欧洲',
    tagline: '剧场、水道与市政废墟同屏出现，罗马城市结构异常好读。',
    description:
      '它不是单一神庙点，而是一套完整的罗马城市构件：公共空间、供水与演艺设施一起在场，有助于扩展官方库里「帝国城市类型」的宽度。',
    bestSeason: '4–5 月 / 10–11 月',
    tags: `['世界遗产', '古罗马', '城市考古']`,
    highlights: `['罗马剧场', '米拉格罗斯高架渠', '城市废墟组团']`,
  },
  'archaeological-site-of-sabratha-tripolitania': {
    aliases: `['萨布拉塔', '利比亚海滨剧场遗址']`,
    country: '利比亚',
    city: '的黎波里塔尼亚地区',
    region: '非洲',
    tagline: '海边罗马剧场与开敞天空叠加，地中海「舞台感」极强。',
    description:
      '海岸让遗址获得内陆址难以比拟的戏剧感：立面、海面与岸线共同构成一眼可记的城市—海洋关系图像。',
    bestSeason: '3–5 月 / 10–11 月',
    tags: `['世界遗产', '古罗马', '滨海遗迹']`,
    highlights: `['海滨罗马剧场', '古典柱式立面', '地中海岸线']`,
  },
  'archipielago-de-los-roques-national-park-los-roques-archipelago': {
    aliases: `['洛斯罗克斯', '加勒比珊瑚环礁']`,
    country: '委内瑞拉',
    city: '洛斯罗克斯群岛',
    region: '南美',
    tagline: '浅绿松石色海水、白沙与珊瑚潟湖，南美侧极具代表性的海岛场景。',
    description:
      '在官方库里补齐「南美视角的加勒比珊瑚群岛」：潟湖、礁盘、亮水与低矮沙岛，影像信息非常直觉。',
    bestSeason: '12 月 — 翌年 4 月',
    tags: `['国家公园', '珊瑚礁', '加勒比']`,
    highlights: `['珊瑚潟湖', '白沙洲', '高光海水色']`,
  },
};

function applyEarlyPatch(inner, id) {
  const p = EARLY_PATCH[id];
  if (!p) return inner;
  let s = inner;
  const setLine = (field, val, isRaw = false) => {
    const v = isRaw ? val : `'${escapeSq(val)}'`;
    s = s.replace(new RegExp(`\\n    ${field}:\\s*'(?:\\\\.|[^'\\\\])*'`), `\n    ${field}: ${v}`);
    s = s.replace(new RegExp(`\\n    ${field}:\\s*"(?:\\\\.|[^"\\\\])*"`), `\n    ${field}: ${v}`);
  };
  if (p.aliases) s = s.replace(/\n    aliases:\s*\[[^\]]*\]/, `\n    aliases: ${p.aliases}`);
  setLine('country', p.country);
  setLine('city', p.city);
  setLine('region', p.region);
  setLine('tagline', p.tagline);
  if (p.description) {
    const d = `\n    description:\n      '${escapeSq(p.description)}'`;
    s = s.replace(/\n    description:\s*\n\s*'(?:\\.|[^'\\])*'/, d);
    s = s.replace(/\n    description:\s*\n\s*"(?:\\.|[^"\\])*"/, d);
    s = s.replace(/\n    description:\s*'(?:\\.|[^'\\])*'/, d);
    s = s.replace(/\n    description:\s*"(?:\\.|[^"\\])*"/, d);
  }
  setLine('bestSeason', p.bestSeason);
  if (p.tags) s = s.replace(/\n    tags:\s*\[[^\]]*\]/, `\n    tags: ${p.tags}`);
  if (p.highlights) s = s.replace(/\n    highlights:\s*\[[^\]]*\]/, `\n    highlights: ${p.highlights}`);
  return s;
}

function localizeProse(inner, id) {
  let s = applyEarlyPatch(inner, id);
  const name = extractName(s);
  if (!name || !/[\u3400-\u9FFF]/.test(name)) return s;
  const cat = extractCategory(s);
  const co = extractField(s, 'country');
  const countryZh = co?.value || '';

  const tag = extractField(s, 'tagline');
  if (tag && hasLongLatin(tag.value)) {
    s = s.replace(tag.raw, `\n    tagline: '${escapeSq(zhTagline(name, cat))}'`);
  }

  const desc = extractDescription(s);
  if (desc && hasLongLatin(desc.value)) {
    const zd = zhDescription(cat);
    const rep = desc.multiline
      ? `\n    description:\n      '${escapeSq(zd)}'`
      : `\n    description: '${escapeSq(zd)}'`;
    s = s.replace(desc.raw, rep);
  }

  const tagArr = s.match(/\n    tags:\s*(\[[^\]]*\])/);
  if (tagArr && /[a-zA-Z]{5,}/.test(tagArr[1])) {
    s = s.replace(tagArr[0], `\n    tags: ${zhTags(cat, countryZh)}`);
  }
  const hiArr = s.match(/\n    highlights:\s*(\[[^\]]*\])/);
  if (hiArr && /[a-zA-Z]{5,}/.test(hiArr[1])) {
    s = s.replace(hiArr[0], `\n    highlights: ${zhHighlights(cat)}`);
  }

  return s;
}

function processFile(text) {
  let t = text;
  t = normalizeCategoryGradeInText(t);
  t = localizeCountriesRegions(t);
  t = normalizeRegionEscapes(t);
  t = normalizeBestSeason(t);

  const startMarker = /export const DESTINATION_POINTS: readonly DestinationPoint\[\] = \[/;
  const sm = startMarker.exec(t);
  if (!sm) throw new Error('DESTINATION_POINTS array opener not found');
  const bracketIdx = sm.index + sm[0].length - 1;
  const endMark = 'export const ORIGIN_PRESETS';
  const endAt = t.indexOf(endMark);
  if (endAt < 0) throw new Error('ORIGIN_PRESETS marker not found');
  const endIdx = t.lastIndexOf('];', endAt);
  if (endIdx < 0) throw new Error('Could not find closing ]; before ORIGIN_PRESETS');
  const header = t.slice(0, bracketIdx + 1);
  let body = t.slice(bracketIdx + 1, endIdx);
  const footer = t.slice(endIdx);

  const blockRe = /\n  \{\n    id: '([^']+)',([\s\S]*?)\n  \},/g;
  const blocks = [];
  let m;
  while ((m = blockRe.exec(body))) {
    blocks.push({ id: m[1], inner: m[2] });
  }

  const rebuiltInner = blocks.map(({ id, inner }) => localizeProse(inner, id));
  body = rebuiltInner.map((inner, i) => `\n  {\n    id: '${blocks[i].id}',${inner}\n  },`).join('');

  return `${header}${body}\n${footer}`;
}

const original = fs.readFileSync(DATA_TS, 'utf8');
const next = processFile(original);
fs.writeFileSync(DATA_TS, next);
console.log('Locale fix wrote', DATA_TS);
