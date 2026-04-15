/**
 * 为 worldscene 按景点抓取更贴近 POI 的本地图片，并尽量提取季节/月份语义：
 * 1. 解析 src/lib/worldsceneData.ts 中的景点元数据
 * 2. 在 zh/en Wikipedia 搜索页面，并拉取 Commons 文件信息
 * 3. 从标题、描述、分类、上传时间中推断月份/季节标签
 * 4. 下载到 public/images/worldscene/poi-*，生成可按当前月份排序的图库元数据
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLDSCENE_POI_OVERRIDES } from './worldscene-poi-overrides.clean.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene');
const GEN_CATALOG_TS = path.join(ROOT, 'src', 'lib', 'worldscenePoiCatalog.gen.ts');
const GEN_LEGACY_TS = path.join(ROOT, 'src', 'lib', 'worldscenePoiCached.gen.ts');
const MANIFEST = path.join(OUT_DIR, 'poi-manifest.json');

const USER_AGENT = 'GameHistory/1.0 (worldscene poi image crawler; educational use)';
const MAX_IMAGES_PER_POINT = 6;
const PAGE_IMAGE_LIMIT = 48;
const REQUEST_TIMEOUT_MS = 16000;
const DOWNLOAD_DELAY_MS = 1600;
const MIN_VALID_IMAGE_BYTES = 40 * 1024;
const MIN_VALID_WIDTH = 640;
const MIN_VALID_HEIGHT = 360;

const MONTH_TERMS = [
  { terms: ['january', 'jan', '一月', '1月'], months: [1] },
  { terms: ['february', 'feb', '二月', '2月'], months: [2] },
  { terms: ['march', 'mar', '三月', '3月'], months: [3] },
  { terms: ['april', 'apr', '四月', '4月'], months: [4] },
  { terms: ['may', '五月', '5月'], months: [5] },
  { terms: ['june', 'jun', '六月', '6月'], months: [6] },
  { terms: ['july', 'jul', '七月', '7月'], months: [7] },
  { terms: ['august', 'aug', '八月', '8月'], months: [8] },
  { terms: ['september', 'sep', 'sept', '九月', '9月'], months: [9] },
  { terms: ['october', 'oct', '十月', '10月'], months: [10] },
  { terms: ['november', 'nov', '十一月', '11月'], months: [11] },
  { terms: ['december', 'dec', '十二月', '12月'], months: [12] },
];

const SEASON_TERMS = {
  spring: ['spring', 'vernal', 'cherry blossom', 'sakura', 'blossom', '花季', '樱花', '春'],
  summer: ['summer', 'green season', 'lush', '暑期', '夏'],
  autumn: ['autumn', 'fall', 'foliage', 'maple', 'red leaves', '秋', '红叶', '金秋'],
  winter: ['winter', 'snow', 'snowy', 'ice', 'frozen', '霜', '冰', '雪', '冬'],
  all: ['all season', '全年', 'all-year', 'year-round'],
};

const SPECIAL_MONTH_TERMS = [
  { terms: ['aurora', 'northern lights', '极光'], months: [9, 10, 11, 12, 1, 2, 3] },
  { terms: ['lavender'], months: [6, 7] },
  { terms: ['sunflower'], months: [7, 8] },
  { terms: ['lotus', '荷花'], months: [6, 7, 8] },
  { terms: ['ginkgo', '银杏'], months: [10, 11] },
  { terms: ['cherry blossom', 'sakura', '樱花'], months: [3, 4] },
  { terms: ['ice festival', '冰雪'], months: [12, 1, 2] },
];

function parseArgs(argv) {
  const args = { limit: null, ids: null, replace: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--limit') {
      args.limit = Number(argv[i + 1] || 0) || null;
      i += 1;
      continue;
    }
    if (token === '--ids') {
      args.ids = new Set(
        String(argv[i + 1] || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
      i += 1;
      continue;
    }
    if (token === '--replace') {
      args.replace = true;
    }
  }
  return args;
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function canonicalImageKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw, 'https://local.invalid');
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+/g, '/');

    if (host.includes('bkimg.cdn.bcebos.com') || host.includes('bkimg.cdn.bcebos.com'.replace(/\./g, ''))) {
      const match = pathname.match(/\/pic\/([^/?#]+)/i);
      if (match?.[1]) return `bkimg:${match[1].toLowerCase()}`;
    }

    if (host.includes('hiphotos.baidu.com')) {
      const match = pathname.match(/\/pic\/item\/([^/?#]+)/i);
      if (match?.[1]) return `hiphotos:${match[1].toLowerCase()}`;
    }

    if (host.includes('upload.wikimedia.org')) {
      return `wikimedia:${decodeURIComponent(pathname).toLowerCase()}`;
    }

    return `${host}${decodeURIComponent(pathname).toLowerCase()}`;
  } catch {
    return raw.toLowerCase().replace(/[?#].*$/, '');
  }
}

function dedupeCollectedImages(images) {
  const bestByKey = new Map();
  for (const image of images) {
    const key = canonicalImageKey(image.remoteUrl || image.url);
    if (!key) continue;
    const existing = bestByKey.get(key);
    const existingPixels = (existing?.width || 0) * (existing?.height || 0);
    const nextPixels = (image.width || 0) * (image.height || 0);
    const existingScore = (existing?.score || 0) + existingPixels / 1000000;
    const nextScore = (image.score || 0) + nextPixels / 1000000;
    if (!existing || nextScore > existingScore) {
      bestByKey.set(key, image);
    }
  }
  return [...bestByKey.values()];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[_()[\]{}.,/\\:'"!?&\-|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tokenize(value) {
  return uniq(
    normalizeText(value)
      .split(' ')
      .filter((token) => token.length >= 2),
  );
}

function scoreTextMatch(haystack, needles) {
  const text = normalizeText(haystack);
  let score = 0;
  for (const needle of needles) {
    const norm = normalizeText(needle);
    if (!norm) continue;
    if (text === norm) score += 60;
    else if (text.includes(norm)) score += 25;

    const tokens = tokenize(needle);
    for (const token of tokens) {
      if (text.includes(token)) score += token.length >= 5 ? 6 : 3;
    }
  }
  return score;
}

function parseDestinationBlocks(text) {
  const blocks = text.match(/  \{\n[\s\S]*?\n  \},?/g) ?? [];
  const rows = [];

  for (const block of blocks) {
    const id = block.match(/\n\s{4}id: '([^']+)'/u)?.[1];
    const name = block.match(/\n\s{4}name: '([^']+)'/u)?.[1];
    const englishName = block.match(/\n\s{4}englishName: '([^']+)'/u)?.[1];
    const country = block.match(/\n\s{4}country: '([^']+)'/u)?.[1];
    const city = block.match(/\n\s{4}city: '([^']+)'/u)?.[1];
    const category = block.match(/\n\s{4}category: '([^']+)'/u)?.[1];
    const lat = Number(block.match(/\n\s{4}lat: ([\d.-]+)/u)?.[1]);
    const lng = Number(block.match(/\n\s{4}lng: ([\d.-]+)/u)?.[1]);
    const aliasMatch = block.match(/\n\s{4}aliases: \[([^\]]*)\]/u)?.[1] ?? '';
    const aliases = [...aliasMatch.matchAll(/'([^']+)'/g)].map((item) => item[1]);
    const imageKind = block.match(/\n\s{4}images: wmCard\('[^']+', '([^']+)'\)/u)?.[1];
    if (!id || !name || !englishName || !country || !city || !category || !imageKind) continue;

    rows.push({
      id,
      name,
      englishName,
      country,
      city,
      category,
      imageKind,
      lat,
      lng,
      aliases,
    });
  }

  return rows;
}

async function fetchJson(url) {
  if (process.platform === 'win32') {
    const command =
      `$ProgressPreference='SilentlyContinue'; ` +
      `$u='${String(url).replace(/'/g, "''")}'; ` +
      `$r=Invoke-RestMethod -Uri $u -Headers @{'User-Agent'='${USER_AGENT.replace(/'/g, "''")}'} -TimeoutSec 45; ` +
      `$r | ConvertTo-Json -Depth 100 -Compress`;
    const raw = execFileSync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ['-Command', command],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(raw);
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json,text/plain,*/*',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchHtml(url) {
  if (process.platform === 'win32') {
    return execFileSync(
      'curl.exe',
      ['-L', '--max-time', '45', '-A', USER_AGENT, String(url)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 },
    );
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function downloadBinary(url, outFile) {
  if (process.platform === 'win32') {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        execFileSync('curl.exe', ['-L', '--fail', '--max-time', '90', '-A', USER_AGENT, '-o', outFile, String(url)], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        await sleep(DOWNLOAD_DELAY_MS);
        return;
      } catch (error) {
        lastError = error;
        await sleep((attempt + 1) * 3500);
      }
    }
    throw lastError;
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  await sleep(DOWNLOAD_DELAY_MS);
}

async function wikipediaSearch(lang, query) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'search');
  url.searchParams.set('srsearch', query);
  url.searchParams.set('srlimit', '5');
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url);
  return data?.query?.search ?? [];
}

async function wikipediaPageData(lang, title) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'pageimages|images');
  url.searchParams.set('titles', title);
  url.searchParams.set('piprop', 'original');
  url.searchParams.set('imlimit', String(PAGE_IMAGE_LIMIT));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url);
  const pages = data?.query?.pages ?? {};
  return Object.values(pages)[0] ?? null;
}

async function commonsImageInfo(fileTitles) {
  if (!fileTitles.length) return [];
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'imageinfo|categories');
  url.searchParams.set('iiprop', 'url|mime|timestamp|size|extmetadata');
  url.searchParams.set('cllimit', '20');
  url.searchParams.set('titles', fileTitles.join('|'));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages ?? {});

  return pages
    .map((page) => {
      const title = page?.title;
      const info = page?.imageinfo?.[0];
      if (!title || !info?.url) return null;
      const ext = info.extmetadata ?? {};
      const description =
        decodeHtml(ext.ImageDescription?.value) ||
        decodeHtml(ext.ObjectName?.value) ||
        '';
      const categories = (page?.categories ?? []).map((item) =>
        String(item.title || '').replace(/^Category:/i, ''),
      );
      return {
        title,
        url: info.url,
        mime: info.mime || '',
        timestamp: info.timestamp || null,
        width: Number(info.width) || undefined,
        height: Number(info.height) || undefined,
        description,
        categories,
      };
    })
    .filter(Boolean);
}

function filePenalty(name) {
  const text = normalizeText(name);
  const bad = [
    'map',
    'locator',
    'plan',
    'logo',
    'flag',
    'symbol',
    'crest',
    'coat of arms',
    'route',
    'ticket',
    'icon',
    'disambiguation',
    'svg',
    'banner',
    'seal',
  ];
  return bad.some((token) => text.includes(token)) ? 120 : 0;
}

function urlPenalty(url) {
  const text = normalizeText(url);
  const bad = [
    'close btn',
    'unsubscribe',
    'subscribe',
    'copy rignt',
    'copyright',
    'common new',
    'icon',
    'logo',
    'avatar',
    'sprite',
    'button',
    'watermark',
    'loading',
  ];
  return bad.some((token) => text.includes(token)) ? 240 : 0;
}

function qualityPenalty(width, height) {
  if (!width || !height) return 0;
  let penalty = 0;
  if (width < MIN_VALID_WIDTH || height < MIN_VALID_HEIGHT) penalty += 180;
  const ratio = width / height;
  if (ratio > 2.4 || ratio < 0.5) penalty += 90;
  if (width < 900 || height < 600) penalty += 35;
  return penalty;
}

function qualityBonus(width, height) {
  if (!width || !height) return 0;
  const pixels = width * height;
  if (pixels >= 2400 * 1600) return 70;
  if (pixels >= 1800 * 1200) return 50;
  if (pixels >= 1200 * 800) return 30;
  return 10;
}

function isAllowedMime(mime) {
  return /^image\/(jpeg|png|webp)$/i.test(mime);
}

function buildSearchTerms(point) {
  const override = WORLDSCENE_POI_OVERRIDES[point.id];
  return uniq([
    ...(override?.searchTerms ?? []),
    `${point.name} ${point.country}`,
    point.name,
    `${point.englishName} ${point.country}`,
    point.englishName,
    point.aliases[0],
    point.aliases[1],
  ]).slice(0, 6);
}

function buildDomesticSearchTerms(point) {
  const override = WORLDSCENE_POI_OVERRIDES[point.id];
  return uniq([
    ...(override?.domesticSearchTerms ?? []),
    point.name,
    `${point.name} ${point.city}`,
    `${point.name} ${point.country}`,
    point.aliases[0],
    point.aliases[1],
  ]).slice(0, 6);
}

function buildTitleNeedles(point) {
  return uniq([point.name, point.englishName, point.city, point.country, ...point.aliases]);
}

function scoreSearchCandidate(point, title, snippet) {
  const needles = buildTitleNeedles(point);
  return scoreTextMatch(title, needles) * 2 + scoreTextMatch(snippet, needles);
}

function scoreImageCandidate(point, fileTitle, description, categories) {
  const needles = buildTitleNeedles(point);
  const joinedCategories = (categories || []).join(' ');
  const override = WORLDSCENE_POI_OVERRIDES[point.id];
  const blob = `${fileTitle} ${description} ${joinedCategories}`;
  const requiredBonus = (override?.requiredTerms ?? []).some((term) =>
    normalizeText(blob).includes(normalizeText(term)),
  )
    ? 60
    : 0;
  const excludedMatched = (override?.excludedTerms ?? []).some((term) =>
    normalizeText(blob).includes(normalizeText(term)),
  );
  if (excludedMatched) return -1000;
  return (
    scoreTextMatch(fileTitle, needles) * 2 +
    scoreTextMatch(description, needles) +
    scoreTextMatch(joinedCategories, needles) -
    filePenalty(fileTitle) +
    requiredBonus
  );
}

function scoreDomesticImageCandidate(point, title, pageTitle, url, width, height, description = '') {
  const needles = buildTitleNeedles(point);
  const blob = `${title} ${pageTitle} ${description} ${url}`;
  const override = WORLDSCENE_POI_OVERRIDES[point.id];
  const normalizedUrl = normalizeText(url);
  const requiredBonus = (override?.requiredTerms ?? []).some((term) =>
    normalizeText(blob).includes(normalizeText(term)),
  )
    ? 45
    : 0;
  const excludedMatched = (override?.excludedTerms ?? []).some((term) =>
    normalizeText(blob).includes(normalizeText(term)),
  );
  if (excludedMatched) return -1000;
  const sourceBonus = normalizedUrl.includes('bkimg') || normalizedUrl.includes('bcebos') ? 80 : 0;
  return (
    scoreTextMatch(blob, needles) * 2 +
    requiredBonus +
    sourceBonus -
    filePenalty(url) -
    urlPenalty(url) -
    qualityPenalty(width, height) +
    qualityBonus(width, height)
  );
}

function extractHtmlImageCandidates(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /https?:\/\/[^"' <>\r\n]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"' <>\r\n]*)?/gi,
    /(?:src|data-src|data-original|data-imgurl)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const raw = match[1] || match[0];
      if (!raw) continue;
      let url = decodeHtml(raw);
      if (url.startsWith('//')) url = `https:${url}`;
      else if (!/^https?:\/\//i.test(url)) {
        try {
          url = new URL(url, baseUrl).href;
        } catch {
          continue;
        }
      }
      url = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }

  return out;
}

function resolveBaiduImageUrl(src, url) {
  const preferred = decodeHtml(url || src || '').trim();
  if (!preferred) return '';
  if (/^https?:\/\//i.test(preferred)) return preferred;
  if (preferred.startsWith('//')) return `https:${preferred}`;
  if (/^[a-z0-9]{20,}$/i.test(preferred)) {
    return `https://bkimg.cdn.bcebos.com/pic/${preferred}`;
  }
  return preferred;
}

function extractBaiduBaikeCandidates(html) {
  const pageTitle =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '百度百科';
  const candidates = [];
  const seen = new Set();

  const metaImage = html.match(/<meta\s+name=["']image["']\s+content=["']([^"']+)["']/i)?.[1];
  if (metaImage) {
    seen.add(metaImage);
    candidates.push({
      url: decodeHtml(metaImage),
      width: undefined,
      height: undefined,
      description: pageTitle,
      pageTitle,
    });
  }

  const albumPattern =
    /"src":"([^"]+)","url":"([^"]*)","width":(\d+),"height":(\d+)[\s\S]{0,180}?"desc":"([^"]*)"/g;
  let match;
  while ((match = albumPattern.exec(html))) {
    const url = resolveBaiduImageUrl(match[1], match[2]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      url,
      width: Number(match[3]) || undefined,
      height: Number(match[4]) || undefined,
      description: decodeHtml(match[5] || ''),
      pageTitle,
    });
  }

  return candidates;
}

async function resolveDomesticImages(point, seenUrl) {
  const collected = [];
  const baiduQueries = buildDomesticSearchTerms(point);
  for (const query of baiduQueries) {
    const pageUrl = `https://baike.baidu.com/item/${encodeURIComponent(query)}`;
    let html = '';
    try {
      html = await fetchHtml(pageUrl);
    } catch {
      continue;
    }

    for (const candidate of extractBaiduBaikeCandidates(html)) {
        const candidateKey = canonicalImageKey(candidate.url);
        if (!candidateKey || seenUrl.has(candidateKey)) continue;
        const score = scoreDomesticImageCandidate(
        point,
        query,
        candidate.pageTitle,
        candidate.url,
        candidate.width,
        candidate.height,
        candidate.description,
      );
      if (score < 80) continue;
      const hints = inferTemporalHints(
        point,
        `${query} ${candidate.pageTitle} ${candidate.description}`,
        null,
      );
        seenUrl.add(candidateKey);
        collected.push({
        url: candidate.url,
        title: `${query} photo`,
        mime: candidate.url.includes('.png') ? 'image/png' : candidate.url.includes('.webp') ? 'image/webp' : 'image/jpeg',
        score,
        source: 'baike.baidu.com',
        pageTitle: candidate.pageTitle,
        timestamp: null,
        monthHints: hints.monthHints,
        seasonHints: hints.seasonHints,
        keywords: hints.keywords,
        width: candidate.width,
        height: candidate.height,
      });
      if (collected.length >= MAX_IMAGES_PER_POINT) {
        return collected;
      }
    }
  }

  const sources = [
    {
      source: 'mafengwo.cn',
      buildUrl(query) {
        return `https://www.mafengwo.cn/search/q.php?q=${encodeURIComponent(query)}`;
      },
    },
    {
      source: 'you.ctrip.com',
      buildUrl(query) {
        return `https://you.ctrip.com/searchsite/Sight?query=${encodeURIComponent(query)}`;
      },
    },
  ];

  for (const query of buildDomesticSearchTerms(point)) {
    for (const source of sources) {
      const pageUrl = source.buildUrl(query);
      let html = '';
      try {
        html = await fetchHtml(pageUrl);
      } catch {
        continue;
      }

      const pageTitle =
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || query;
      const imageUrls = extractHtmlImageCandidates(html, pageUrl);

      for (const imageUrl of imageUrls) {
        const imageKey = canonicalImageKey(imageUrl);
        if (!imageKey || seenUrl.has(imageKey)) continue;
        const score = scoreDomesticImageCandidate(point, query, pageTitle, imageUrl);
        if (score < 55) continue;
        const hints = inferTemporalHints(point, `${query} ${pageTitle} ${imageUrl}`, null);
        seenUrl.add(imageKey);
        collected.push({
          url: imageUrl,
          title: `${query} photo`,
          mime: imageUrl.includes('.png') ? 'image/png' : imageUrl.includes('.webp') ? 'image/webp' : 'image/jpeg',
          score,
          source: source.source,
          pageTitle,
          timestamp: null,
          monthHints: hints.monthHints,
          seasonHints: hints.seasonHints,
          keywords: hints.keywords,
        });
        if (collected.length >= MAX_IMAGES_PER_POINT) {
          return collected;
        }
      }
    }
  }

  return collected;
}

function shouldTryDomesticSources(point) {
  return true;
}

function monthsFromSeason(season, lat) {
  const north = {
    spring: [3, 4, 5],
    summer: [6, 7, 8],
    autumn: [9, 10, 11],
    winter: [12, 1, 2],
  };
  const south = {
    spring: [9, 10, 11],
    summer: [12, 1, 2],
    autumn: [3, 4, 5],
    winter: [6, 7, 8],
  };

  if (season === 'all') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (lat < -12) return south[season] ?? [];
  return north[season] ?? [];
}

function inferTemporalHints(point, text, timestamp) {
  const normalized = normalizeText(text);
  const monthHints = [];
  const seasonHints = [];
  const keywords = [];
  const override = WORLDSCENE_POI_OVERRIDES[point.id];

  for (const item of MONTH_TERMS) {
    if (item.terms.some((term) => normalized.includes(normalizeText(term)))) {
      monthHints.push(...item.months);
      keywords.push(item.terms[0]);
    }
  }

  for (const item of SPECIAL_MONTH_TERMS) {
    if (item.terms.some((term) => normalized.includes(normalizeText(term)))) {
      monthHints.push(...item.months);
      keywords.push(item.terms[0]);
    }
  }

  for (const [season, terms] of Object.entries(SEASON_TERMS)) {
    if (terms.some((term) => normalized.includes(normalizeText(term)))) {
      seasonHints.push(season);
      monthHints.push(...monthsFromSeason(season, point.lat));
      keywords.push(terms[0]);
    }
  }

  if (timestamp) {
    const uploaded = new Date(timestamp);
    if (!Number.isNaN(uploaded.getTime())) {
      monthHints.push(uploaded.getUTCMonth() + 1);
    }
  }

  if (override?.preferredMonths?.length) {
    monthHints.push(...override.preferredMonths);
  }
  if (override?.preferredSeasons?.length) {
    seasonHints.push(...override.preferredSeasons);
  }

  return {
    monthHints: uniq(
      monthHints.map((month) => Number(month)).filter((month) => month >= 1 && month <= 12),
    ),
    seasonHints: uniq(seasonHints),
    keywords: uniq(keywords),
  };
}

async function resolvePointImages(point) {
  const candidatePages = [];
  const directTitles = uniq([point.name, point.englishName, ...point.aliases]).slice(0, 6);
  for (const lang of ['zh', 'en']) {
    for (const title of directTitles) {
      candidatePages.push({
        lang,
        title,
        snippet: '',
        score: scoreSearchCandidate(point, title, '') + 80,
      });
    }
  }

  for (const lang of ['zh', 'en']) {
    for (const query of buildSearchTerms(point)) {
      let results;
      try {
        results = await wikipediaSearch(lang, query);
      } catch {
        continue;
      }

      for (const item of results) {
        candidatePages.push({
          lang,
          title: item.title,
          snippet: item.snippet || '',
          score: scoreSearchCandidate(point, item.title, item.snippet || ''),
        });
      }
    }
  }

  const uniquePages = [];
  const seenPage = new Set();
  for (const page of candidatePages.sort((a, b) => b.score - a.score)) {
    const key = `${page.lang}:${page.title}`;
    if (seenPage.has(key)) continue;
    seenPage.add(key);
    uniquePages.push(page);
  }

  const collected = [];
  const seenUrl = new Set();

  for (const page of uniquePages.slice(0, 8)) {
    console.log(`  尝试页面 ${page.lang}:${page.title}`);
    let pageData;
    try {
      pageData = await wikipediaPageData(page.lang, page.title);
    } catch {
      continue;
    }
    if (!pageData) continue;

    const originalUrl = pageData.original?.source;
    const originalKey = canonicalImageKey(originalUrl);
    if (originalUrl && originalKey && !seenUrl.has(originalKey)) {
      seenUrl.add(originalKey);
      const hints = inferTemporalHints(point, `${page.title} ${page.snippet}`, null);
      collected.push({
        url: originalUrl,
        title: `${page.title} original`,
        mime: originalUrl.includes('.png') ? 'image/png' : 'image/jpeg',
        score: 120,
        source: `${page.lang}.wikipedia.org:${page.title}`,
        pageTitle: page.title,
        timestamp: null,
        monthHints: hints.monthHints,
        seasonHints: hints.seasonHints,
        keywords: hints.keywords,
      });
    }

    const fileTitles = (pageData.images ?? [])
      .map((item) => item.title)
      .filter((title) => /^File:/i.test(title))
      .filter((title) => !filePenalty(title));

    const commonsItems = await commonsImageInfo(fileTitles.slice(0, PAGE_IMAGE_LIMIT));
    for (const item of commonsItems) {
      const itemKey = canonicalImageKey(item.url);
      if (!isAllowedMime(item.mime) || !itemKey || seenUrl.has(itemKey)) continue;
      const score = scoreImageCandidate(point, item.title, item.description, item.categories);
      if (score <= 0) continue;

      const textBlob = [item.title, item.description, ...(item.categories ?? [])].join(' ');
      const hints = inferTemporalHints(point, textBlob, item.timestamp);
      seenUrl.add(itemKey);
      collected.push({
        url: item.url,
        title: item.title,
        mime: item.mime,
        score,
        source: `${page.lang}.wikipedia.org:${page.title}`,
        pageTitle: page.title,
        timestamp: item.timestamp,
        monthHints: hints.monthHints,
        seasonHints: hints.seasonHints,
        keywords: hints.keywords,
        width: item.width,
        height: item.height,
      });
    }
  }

  if (shouldTryDomesticSources(point) || collected.length < MAX_IMAGES_PER_POINT) {
    const domestic = await resolveDomesticImages(point, seenUrl);
    for (const item of domestic) {
      collected.push(item);
    }
  }

  return dedupeCollectedImages(collected)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_IMAGES_PER_POINT);
}

function extFromMime(mime, url) {
  if (/png/i.test(mime)) return 'png';
  if (/webp/i.test(mime)) return 'webp';
  if (/jpe?g/i.test(mime)) return 'jpg';
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return 'png';
  if (pathname.endsWith('.webp')) return 'webp';
  return 'jpg';
}

function formatLegacyTs(pointToPaths) {
  const keys = Object.keys(pointToPaths).sort();
  const rows = keys.map((key) => {
    const paths = pointToPaths[key];
    const list = paths.map((item) => `'${item}'`).join(', ');
    return `  '${key}': [${list}],`;
  });

  return `/**\n * 由 scripts/cache-worldscene-poi-catalog.mjs 生成 — 勿手改。\n */\nexport const PROJECT2_POI_LOCAL: Record<string, readonly string[]> = {\n${rows.join('\n')}\n};\n`;
}

function formatCatalogTs(pointCatalog) {
  const keys = Object.keys(pointCatalog).sort();
  const rows = keys.map((key) => {
    const images = pointCatalog[key]
      .map((image) => {
        const monthHints = image.monthHints?.length
          ? `monthHints: [${image.monthHints.join(', ')}], `
          : '';
        const seasonHints = image.seasonHints?.length
          ? `seasonHints: [${image.seasonHints.map((item) => `'${item}'`).join(', ')}], `
          : '';
        const keywords = image.keywords?.length
          ? `keywords: [${image.keywords.map((item) => `'${String(item).replace(/'/g, "\\'")}'`).join(', ')}], `
          : '';
        const title = image.title ? `title: '${String(image.title).replace(/'/g, "\\'")}', ` : '';
        const pageTitle = image.pageTitle
          ? `pageTitle: '${String(image.pageTitle).replace(/'/g, "\\'")}', `
          : '';
        const capturedAt = image.capturedAt ? `capturedAt: '${image.capturedAt}', ` : '';
        const score = Number.isFinite(image.score) ? `score: ${Math.round(image.score)}, ` : '';
        return `    { url: '${image.url}', source: '${image.source}', ${title}${pageTitle}${capturedAt}${score}${monthHints}${seasonHints}${keywords}},`;
      })
      .join('\n');

    return `  '${key}': {\n    images: [\n${images}\n    ],\n  },`;
  });

  return `import type { WorldScenePoiCatalogEntry } from './worldscenePoiCatalog';\n\n/**\n * 由 scripts/cache-worldscene-poi-catalog.mjs 生成 — 勿手改。\n */\nexport const WORLDSCENE_POI_CATALOG: Record<string, WorldScenePoiCatalogEntry> = {\n${rows.join('\n')}\n};\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataText = fs.readFileSync(DATA_TS, 'utf8');
  let points = parseDestinationBlocks(dataText);
  const existingManifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};

  if (args.ids?.size) {
    points = points.filter((point) => args.ids.has(point.id));
  }
  if (args.limit) {
    points = points.slice(0, args.limit);
  }
  if (!points.length) {
    console.log('没有匹配到需要抓图的景点。');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const legacyMap = Object.fromEntries(
    Object.entries(existingManifest).map(([pointId, entry]) => [
      pointId,
      (entry.images ?? []).map((image) => image.url).filter(Boolean),
    ]),
  );
  const catalogMap = Object.fromEntries(
    Object.entries(existingManifest).map(([pointId, entry]) => [pointId, entry.images ?? []]),
  );
  const manifest = { ...existingManifest };
  const misses = [];

  for (const point of points) {
    console.log(`\n[POI] ${point.id} ${point.name}`);
    let resolved;
    try {
      resolved = await resolvePointImages(point);
    } catch (error) {
      console.warn(`  解析失败: ${error instanceof Error ? error.message : String(error)}`);
      misses.push(point.id);
      continue;
    }

    if (!resolved.length) {
      console.warn('  未找到可信图片，保留库存图回退。');
      misses.push(point.id);
      continue;
    }

    const localPaths = [];
    const imageMeta = [];
    for (let index = 0; index < resolved.length; index += 1) {
      const image = resolved[index];
      const ext = extFromMime(image.mime, image.url);
      const base = `poi-${point.id}-${index + 1}.${ext}`;
      const diskPath = path.join(OUT_DIR, base);
      if (!fs.existsSync(diskPath) || args.replace) {
        process.stdout.write(`  GET ${base} ... `);
        try {
          await downloadBinary(image.url, diskPath);
          const size = fs.statSync(diskPath).size;
          if (size < MIN_VALID_IMAGE_BYTES) {
            fs.rmSync(diskPath, { force: true });
            console.log(`SKIP (too small: ${size} bytes)`);
            continue;
          }
          if (qualityPenalty(image.width, image.height) >= 180) {
            fs.rmSync(diskPath, { force: true });
            console.log(`SKIP (low resolution: ${image.width || 0}x${image.height || 0})`);
            continue;
          }
          console.log(`${size} bytes`);
        } catch (error) {
          console.log(`SKIP (${error instanceof Error ? error.message : String(error)})`);
          continue;
        }
      } else {
        console.log(`  SKIP ${base}`);
      }

      const localUrl = `/images/worldscene/${base}`;
      localPaths.push(localUrl);
      imageMeta.push({
        url: localUrl,
        source: image.source,
        title: image.title,
        pageTitle: image.pageTitle,
        capturedAt: image.timestamp || undefined,
        score: image.score,
        monthHints: image.monthHints,
        seasonHints: image.seasonHints,
        keywords: image.keywords,
        width: image.width,
        height: image.height,
        remoteUrl: image.url,
      });
    }

    if (localPaths.length === 0) {
      misses.push(point.id);
      continue;
    }

    const dedupedMeta = dedupeCollectedImages(
      imageMeta.map((image, index) => ({
        ...image,
        score: Number.isFinite(image.score) ? image.score : 100 - index,
        remoteUrl: image.remoteUrl || image.url,
      })),
    );
    const dedupedPaths = dedupedMeta.map((image) => image.url);

    legacyMap[point.id] = dedupedPaths;
    catalogMap[point.id] = dedupedMeta;
    manifest[point.id] = {
      point: {
        name: point.name,
        englishName: point.englishName,
        country: point.country,
        city: point.city,
        lat: point.lat,
        lng: point.lng,
      },
      images: dedupedMeta,
    };
  }

  fs.writeFileSync(GEN_LEGACY_TS, formatLegacyTs(legacyMap), 'utf8');
  fs.writeFileSync(GEN_CATALOG_TS, formatCatalogTs(catalogMap), 'utf8');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n已写入 ${GEN_LEGACY_TS}`);
  console.log(`已写入 ${GEN_CATALOG_TS}`);
  console.log(`已写入 ${MANIFEST}`);
  if (misses.length) {
    console.log(`未命中 ${misses.length} 个景点：${misses.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
