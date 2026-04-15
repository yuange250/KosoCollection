/**
 * 为项目 2 按景点抓取更贴近 POI 的真实图片，并缓存到本地：
 * 1. 解析 src/lib/worldsceneData.ts 中的景点元数据
 * 2. 在 zh/en Wikipedia 搜索页面
 * 3. 从页面主图和页面挂载文件中筛选景点图
 * 4. 下载到 public/images/worldscene/poi-*，并生成 src/lib/worldscenePoiCached.gen.ts
 *
 * 用法：
 *   node scripts/cache-worldscene-poi-images.mjs
 *   node scripts/cache-worldscene-poi-images.mjs --limit 5
 *   node scripts/cache-worldscene-poi-images.mjs --ids forbidden-city,eiffel-tower
 *   node scripts/cache-worldscene-poi-images.mjs --replace
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'worldscene');
const GEN_TS = path.join(ROOT, 'src', 'lib', 'worldscenePoiCached.gen.ts');
const MANIFEST = path.join(OUT_DIR, 'poi-manifest.json');

const USER_AGENT = 'GameHistory/1.0 (worldscene poi image crawler; educational use)';
const MAX_IMAGES_PER_POINT = 3;
const PAGE_IMAGE_LIMIT = 24;
const REQUEST_TIMEOUT_MS = 12000;

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[_()[\]{}.,/\\:'"!?&\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      aliases,
    });
  }

  return rows;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json,text/plain,*/*',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  return { contentType, buf };
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
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|mime');
  url.searchParams.set('titles', fileTitles.join('|'));
  url.searchParams.set('origin', '*');
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages ?? {});
  return pages
    .map((page) => {
      const title = page?.title;
      const info = page?.imageinfo?.[0];
      if (!title || !info?.url) return null;
      return {
        title,
        url: info.url,
        mime: info.mime || '',
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
  ];
  return bad.some((token) => text.includes(token)) ? 120 : 0;
}

function isAllowedMime(mime) {
  return /^image\/(jpeg|png|webp)$/i.test(mime);
}

function buildSearchTerms(point) {
  return uniq([
    `${point.name} ${point.country}`,
    point.name,
    `${point.englishName} ${point.country}`,
    point.englishName,
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

function scoreImageCandidate(point, fileTitle) {
  const needles = buildTitleNeedles(point);
  return scoreTextMatch(fileTitle, needles) - filePenalty(fileTitle);
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

  for (const page of uniquePages.slice(0, 8)) {
    console.log(`  尝试页面 ${page.lang}:${page.title}`);
    let pageData;
    try {
      pageData = await wikipediaPageData(page.lang, page.title);
    } catch {
      continue;
    }
    if (!pageData) continue;

    const candidates = [];
    const seenUrl = new Set();
    const originalUrl = pageData.original?.source;
    if (originalUrl) {
      candidates.push({
        url: originalUrl,
        title: `${page.title} original`,
        mime: originalUrl.includes('.png') ? 'image/png' : 'image/jpeg',
        score: 120,
        source: `${page.lang}.wikipedia.org:${page.title}`,
      });
      seenUrl.add(originalUrl);
    }

    const fileTitles = (pageData.images ?? [])
      .map((item) => item.title)
      .filter((title) => /^File:/i.test(title))
      .filter((title) => !filePenalty(title));

    const commonsItems = await commonsImageInfo(fileTitles.slice(0, PAGE_IMAGE_LIMIT));
    for (const item of commonsItems) {
      if (!isAllowedMime(item.mime) || seenUrl.has(item.url)) continue;
      const score = scoreImageCandidate(point, item.title);
      if (score <= 0) continue;
      seenUrl.add(item.url);
      candidates.push({
        url: item.url,
        title: item.title,
        mime: item.mime,
        score,
        source: `${page.lang}.wikipedia.org:${page.title}`,
      });
    }

    const picked = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_IMAGES_PER_POINT);

    if (picked.length > 0) {
      return {
        page,
        images: picked,
      };
    }
  }

  return null;
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

function formatGenTs(pointToPaths) {
  const keys = Object.keys(pointToPaths).sort();
  const rows = keys.map((key) => {
    const paths = pointToPaths[key];
    const list = paths.map((item) => `'${item}'`).join(', ');
    return `  '${key}': [${list}],`;
  });

  return `/**\n * 由 scripts/cache-worldscene-poi-images.mjs 生成 — 勿手改。\n */\nexport const PROJECT2_POI_LOCAL: Record<string, readonly string[]> = {\n${rows.join('\n')}\n};\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataText = fs.readFileSync(DATA_TS, 'utf8');
  let points = parseDestinationBlocks(dataText);

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

  const nextMap = {};
  const manifest = {};
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

    if (!resolved?.images?.length) {
      console.warn('  未找到可信图片，保留库存图回退。');
      misses.push(point.id);
      continue;
    }

    const localPaths = [];
    const imageMeta = [];
    for (let index = 0; index < resolved.images.length; index += 1) {
      const image = resolved.images[index];
      const ext = extFromMime(image.mime, image.url);
      const base = `poi-${point.id}-${index + 1}.${ext}`;
      const diskPath = path.join(OUT_DIR, base);
      if (!fs.existsSync(diskPath) || args.replace) {
        process.stdout.write(`  GET ${base} ... `);
        const { buf } = await fetchBinary(image.url);
        fs.writeFileSync(diskPath, buf);
        console.log(`${buf.length} bytes`);
      } else {
        console.log(`  SKIP ${base}`);
      }
      localPaths.push(`/images/worldscene/${base}`);
      imageMeta.push({
        file: base,
        source: image.source,
        title: image.title,
        remoteUrl: image.url,
      });
    }

    nextMap[point.id] = localPaths;
    manifest[point.id] = {
      page: resolved.page,
      images: imageMeta,
    };
  }

  fs.writeFileSync(GEN_TS, formatGenTs(nextMap), 'utf8');
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\n已写入 ${GEN_TS}`);
  console.log(`已写入 ${MANIFEST}`);
  if (misses.length) {
    console.log(`未命中 ${misses.length} 个景点：${misses.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

