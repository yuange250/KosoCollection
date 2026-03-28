/**
 * Bangumi（番组计划）国内可访问批量抓取（游戏条目）
 *
 * 数据来源：api.bgm.tv v0 subjects
 * - type=4（游戏）
 * - sort=rank / date
 *
 * 输出：
 * - public/data/bulk/nodes-bgm-*.json
 * - public/data/bulk/manifest.json（与现有加载器兼容）
 *
 * 用法（PowerShell）：
 *   node scripts/fetch-bgm-games-cn.mjs
 *   $env:BGM_MAX_PAGES=30; node scripts/fetch-bgm-games-cn.mjs
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BULK_DIR = join(root, 'public', 'data', 'bulk');
const UA = 'GameHistoryTimeline/1.0 (bgm-cn-bulk)';

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env'));

const BGM_LIMIT = Math.max(10, Math.min(100, parseInt(process.env.BGM_LIMIT || '30', 10) || 30));
const BGM_START_PAGE = Math.max(1, parseInt(process.env.BGM_START_PAGE || '1', 10) || 1);
const BGM_START_OFFSET = Math.max(
  0,
  parseInt(process.env.BGM_START_OFFSET || String((BGM_START_PAGE - 1) * BGM_LIMIT), 10) || 0,
);
const BGM_MAX_PAGES = Math.max(1, parseInt(process.env.BGM_MAX_PAGES || '120', 10) || 120);
const BGM_SLEEP_MS = Math.max(80, parseInt(process.env.BGM_SLEEP_MS || '180', 10) || 180);
const BGM_CHUNK_SIZE = Math.min(8000, Math.max(1000, parseInt(process.env.BGM_CHUNK_SIZE || '4000', 10) || 4000));
const BGM_SORT = (process.env.BGM_SORT || 'rank').trim(); // rank/date
const BGM_RETRY_TIMES = Math.max(1, parseInt(process.env.BGM_RETRY_TIMES || '4', 10) || 4);
const BGM_RETRY_BASE_MS = Math.max(150, parseInt(process.env.BGM_RETRY_BASE_MS || '500', 10) || 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{4})$/);
  if (m) return t;
  m = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;
  m = t.match(/^(\d{4})年(\d{1,2})月$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  return null;
}

function tagsFromSubject(s) {
  const tags = new Set(['game']);
  const tagNames = (s?.tags || []).map((x) => (x?.name || '').toLowerCase());
  const platform = String(s?.platform || '').toLowerCase();
  const all = `${tagNames.join(' ')} ${platform} ${s?.name || ''} ${s?.name_cn || ''}`.toLowerCase();

  if (/pc|windows|steam|mac|linux/.test(all)) tags.add('PC');
  if (/playstation|xbox|switch|任天堂|主机/.test(all)) tags.add('主机');
  if (/mobile|手游|安卓|ios/.test(all)) tags.add('移动');
  if (![...tags].some((x) => x === 'PC' || x === '主机' || x === '移动')) tags.add('主机');

  if (/rpg|角色扮演/.test(all)) tags.add('RPG');
  else if (/策略|strategy|simulation|sim/.test(all)) tags.add('策略');
  else if (/fps|射击|shooter/.test(all)) tags.add('FPS');
  else tags.add('休闲');

  if (/国产|中国|国创/.test(all)) tags.add('中国');
  else if (/日本|jrpg|galgame|日式/.test(all)) tags.add('日本');
  else tags.add('全球');

  if (/独立|indie/.test(all)) tags.add('独立');
  return [...tags];
}

function mapSubject(s) {
  const name = s?.name_cn || s?.name || `Bangumi#${s?.id}`;
  const img = s?.images?.large || s?.images?.common || s?.images?.medium || '/placeholders/game.svg';
  const intro = (s?.summary || `${name}（Bangumi 游戏条目）`).replace(/\s+/g, ' ').trim();
  const time = parseDate(s?.date) || '2000';

  return {
    id: `bgm-${s.id}`,
    time,
    type: 'game',
    title: name,
    content: {
      intro: intro.slice(0, 220),
      details: {
        developer: '见 Bangumi 条目',
        publisher: '见 Bangumi 条目',
        sales: '不详',
        easterEgg: '无',
      },
      imageUrl: img,
      sourceUrl: `https://bgm.tv/subject/${s.id}`,
      tags: tagsFromSubject(s),
    },
    relatedNodes: [],
  };
}

async function fetchJson(url) {
  let lastErr = null;
  for (let i = 0; i < BGM_RETRY_TIMES; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < BGM_RETRY_TIMES - 1) await sleep(BGM_RETRY_BASE_MS * (i + 1));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

async function main() {
  if (existsSync(BULK_DIR)) rmSync(BULK_DIR, { recursive: true });
  mkdirSync(BULK_DIR, { recursive: true });

  console.log(
    'Bangumi 抓取开始',
    `startOffset=${BGM_START_OFFSET}`,
    `limit=${BGM_LIMIT}`,
    `maxPages=${BGM_MAX_PAGES}`,
    `sort=${BGM_SORT}`,
  );

  let requestCount = 0;
  let total = null;
  const byId = new Map();
  let chunkBuf = [];
  let chunkIdx = 0;

  const flushChunk = () => {
    if (!chunkBuf.length) return;
    const fname = `nodes-bgm-${String(chunkIdx).padStart(4, '0')}.json`;
    writeFileSync(join(BULK_DIR, fname), JSON.stringify(chunkBuf), 'utf8');
    console.log('写入', fname, '条数', chunkBuf.length, '累计唯一', byId.size);
    chunkBuf = [];
    chunkIdx++;
  };

  for (let i = 0; i < BGM_MAX_PAGES; i++) {
    const offset = BGM_START_OFFSET + i * BGM_LIMIT;
    let data;
    try {
      const url = new URL('https://api.bgm.tv/v0/subjects');
      url.searchParams.set('type', '4');
      url.searchParams.set('sort', BGM_SORT);
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('limit', String(BGM_LIMIT));
      data = await fetchJson(url);
      requestCount++;
    } catch (e) {
      console.warn('offset', offset, '失败', e.message);
      break;
    }

    if (typeof data?.total === 'number') total = data.total;
    const arr = data?.data || [];
    if (!arr.length) break;

    for (const s of arr) {
      if (!s?.id) continue;
      const node = mapSubject(s);
      if (byId.has(node.id)) continue;
      byId.set(node.id, true);
      chunkBuf.push(node);
      if (chunkBuf.length >= BGM_CHUNK_SIZE) flushChunk();
    }

    if ((i + 1) % 10 === 0) {
      console.log('进度 page', i + 1, 'offset', offset, '累计', byId.size, total ? `/ total ${total}` : '');
    }
    await sleep(BGM_SLEEP_MS);
  }

  flushChunk();

  const parts = [];
  for (let i = 0; i < chunkIdx; i++) {
    parts.push(`bulk/nodes-bgm-${String(i).padStart(4, '0')}.json`);
  }

  writeFileSync(
    join(BULK_DIR, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        source: 'bgm-cn',
        generatedAt: new Date().toISOString(),
        totalGames: byId.size,
        requestCount,
        chunkSize: BGM_CHUNK_SIZE,
        limit: BGM_LIMIT,
        startPage: BGM_START_PAGE,
        startOffset: BGM_START_OFFSET,
        maxPages: BGM_MAX_PAGES,
        sort: BGM_SORT,
        parts,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log('完成：唯一游戏', byId.size, 'API请求', requestCount, '分片', parts.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
