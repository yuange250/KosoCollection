/**
 * Steam 国内可访问批量抓取（不依赖 RAWG/Wiki）
 *
 * 数据来源：
 * - app 列表：ISteamApps/GetAppList
 * - 详情：store appdetails（含封面、发行日、平台、开发商、发行商、类型）
 *
 * 输出：
 * - public/data/bulk/nodes-steam-*.json
 * - public/data/bulk/manifest.json（与现有加载器兼容）
 *
 * 用法（PowerShell）：
 *   node scripts/fetch-steam-games-cn.mjs
 *   $env:STEAM_MAX_APPS=8000; node scripts/fetch-steam-games-cn.mjs
 *   $env:STEAM_START_INDEX=20000; $env:STEAM_MAX_APPS=5000; node scripts/fetch-steam-games-cn.mjs
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BULK_DIR = join(root, 'public', 'data', 'bulk');
const UA = 'GameHistoryTimeline/1.0 (steam-cn-bulk)';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env'));

const STEAM_MAX_APPS = Math.max(1, parseInt(process.env.STEAM_MAX_APPS || '3500', 10) || 3500);
const STEAM_START_INDEX = Math.max(0, parseInt(process.env.STEAM_START_INDEX || '0', 10) || 0);
const STEAM_CHUNK_SIZE = Math.min(8000, Math.max(1000, parseInt(process.env.STEAM_CHUNK_SIZE || '4000', 10) || 4000));
const STEAM_SLEEP_MS = Math.max(60, parseInt(process.env.STEAM_SLEEP_MS || '140', 10) || 140);
const STEAM_MAX_REQUESTS = Math.max(100, parseInt(process.env.STEAM_MAX_REQUESTS || '50000', 10) || 50000);
const STEAM_ONLY_GAMES = process.env.STEAM_ONLY_GAMES !== '0';
const RETRY_TIMES = Math.max(1, parseInt(process.env.STEAM_RETRY_TIMES || '4', 10) || 4);
const RETRY_BASE_MS = Math.max(120, parseInt(process.env.STEAM_RETRY_BASE_MS || '500', 10) || 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toTime(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  // 12 Jan, 2016
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (m) {
    const monthMap = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
      jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
      oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
    };
    const mm = monthMap[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${String(mm).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;
  }
  // Jan 2016
  m = t.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const mm = monthMap[m[1].slice(0, 3).toLowerCase()];
    if (mm) return `${m[2]}-${String(mm).padStart(2, '0')}`;
  }
  // YYYY年M月D日 / YYYY年M月 / YYYY-MM-DD / YYYY-MM
  m = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;
  m = t.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{4})$/);
  if (m) return t;
  return null;
}

function inferTags(data) {
  const tags = new Set(['game']);
  const cats = (data?.categories || []).map((x) => (x?.description || '').toLowerCase());
  const genres = (data?.genres || []).map((x) => (x?.description || '').toLowerCase());
  const text = `${cats.join(' ')} ${genres.join(' ')} ${data?.name || ''}`.toLowerCase();

  if (data?.platforms?.windows || data?.platforms?.linux || data?.platforms?.mac) tags.add('PC');
  if (/strategy|sim|simulation|city builder|4x/.test(text)) tags.add('策略');
  else if (/rpg|role-playing|action rpg|jrpg/.test(text)) tags.add('RPG');
  else if (/fps|shooter|first-person|third-person shooter/.test(text)) tags.add('FPS');
  else if (/casual|puzzle|card|board|family/.test(text)) tags.add('休闲');
  else tags.add('休闲');

  if (/chinese|china|国产|中国/.test(text)) tags.add('中国');
  else if (/japanese|anime|日本/.test(text)) tags.add('日本');
  else tags.add('全球');

  if (/indie|独立/.test(text)) tags.add('独立');
  return [...tags];
}

function mapSteamNode(appid, data) {
  const releaseRaw = data?.release_date?.date || '';
  const time = toTime(releaseRaw) || '2000';
  const imageUrl = data?.header_image || data?.capsule_image || data?.background_raw || '/placeholders/game.svg';
  const intro = (data?.short_description || `${data?.name || '未知游戏'}（Steam 数据）`).replace(/\s+/g, ' ').trim();

  return {
    id: `steam-${appid}`,
    time,
    type: 'game',
    title: data?.name || `Steam App ${appid}`,
    content: {
      intro: intro.slice(0, 220),
      details: {
        developer: (data?.developers && data.developers[0]) || '不详',
        publisher: (data?.publishers && data.publishers[0]) || 'Steam',
        sales: '不详',
        easterEgg: '无',
      },
      imageUrl,
      sourceUrl: `https://store.steampowered.com/app/${appid}/`,
      tags: inferTags(data),
    },
    relatedNodes: [],
  };
}

async function fetchJson(url, opts = {}) {
  const retries = opts.retries ?? RETRY_TIMES;
  let lastErr = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries - 1) {
        const wait = RETRY_BASE_MS * (i + 1);
        await sleep(wait);
      }
    }
  }
  throw lastErr ?? new Error('fetchJson failed');
}

async function fetchAppList() {
  const endpoints = [
    'https://api.steampowered.com/ISteamApps/GetAppList/v2/',
    'https://api.steampowered.com/ISteamApps/GetAppList/v0002/',
  ];
  let lastErr = null;
  for (const ep of endpoints) {
    try {
      const data = await fetchJson(ep, { retries: RETRY_TIMES + 1 });
      const arr = data?.applist?.apps || [];
      const filtered = arr.filter((x) => x?.appid && x?.name && String(x.name).trim().length >= 2);
      if (filtered.length) return filtered;
      lastErr = new Error(`empty app list from ${ep}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('fetch app list failed');
}

async function fetchAppDetail(appid) {
  const url = `https://store.steampowered.com/api/appdetails?l=schinese&cc=cn&appids=${appid}`;
  const data = await fetchJson(url);
  const bucket = data?.[String(appid)];
  if (!bucket?.success || !bucket?.data) return null;
  return bucket.data;
}

async function main() {
  console.log('拉取 Steam app 列表…');
  const list = await fetchAppList();
  const sliced = list.slice(STEAM_START_INDEX, STEAM_START_INDEX + STEAM_MAX_APPS);
  console.log('列表总数', list.length, '本次范围', `${STEAM_START_INDEX}..${STEAM_START_INDEX + sliced.length - 1}`);

  if (existsSync(BULK_DIR)) rmSync(BULK_DIR, { recursive: true });
  mkdirSync(BULK_DIR, { recursive: true });

  let requestCount = 0;
  const byId = new Map();
  let chunkBuf = [];
  let chunkIdx = 0;

  const flushChunk = () => {
    if (!chunkBuf.length) return;
    const fname = `nodes-steam-${String(chunkIdx).padStart(4, '0')}.json`;
    writeFileSync(join(BULK_DIR, fname), JSON.stringify(chunkBuf), 'utf8');
    console.log('写入', fname, '条数', chunkBuf.length, '累计唯一', byId.size);
    chunkBuf = [];
    chunkIdx++;
  };

  for (const app of sliced) {
    if (requestCount >= STEAM_MAX_REQUESTS) {
      console.warn('达到 STEAM_MAX_REQUESTS，提前停止。');
      break;
    }
    requestCount++;
    let data = null;
    try {
      data = await fetchAppDetail(app.appid);
    } catch (e) {
      if (requestCount % 100 === 0) console.warn('详情失败', app.appid, e.message);
    }

    if (data) {
      const t = String(data.type || '').toLowerCase();
      if (!STEAM_ONLY_GAMES || t === 'game') {
        const node = mapSteamNode(app.appid, data);
        if (!byId.has(node.id)) {
          byId.set(node.id, true);
          chunkBuf.push(node);
          if (chunkBuf.length >= STEAM_CHUNK_SIZE) flushChunk();
        }
      }
    }

    if (requestCount % 200 === 0) {
      console.log('进度', requestCount, '/', sliced.length, '累计', byId.size);
    }
    await sleep(STEAM_SLEEP_MS);
  }

  flushChunk();

  const parts = [];
  for (let i = 0; i < chunkIdx; i++) {
    parts.push(`bulk/nodes-steam-${String(i).padStart(4, '0')}.json`);
  }

  writeFileSync(
    join(BULK_DIR, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        source: 'steam-cn',
        generatedAt: new Date().toISOString(),
        totalGames: byId.size,
        requestCount,
        chunkSize: STEAM_CHUNK_SIZE,
        startIndex: STEAM_START_INDEX,
        maxApps: STEAM_MAX_APPS,
        parts,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('完成：唯一游戏', byId.size, '请求数', requestCount, '分片', parts.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
