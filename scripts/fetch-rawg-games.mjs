/**
 * RAWG 全量/多策略分页抓取（需 RAWG_API_KEY：https://rawg.io/apidocs）
 *
 * - 默认不设条数上限：依次跑多种 ordering、父平台、独立/休闲等流派，直到该策略无下一页。
 * - 安全阀：MAX_REQUESTS（默认 80000 次 API）、MAX_GAMES（0=不限制）、SLEEP_MS（请求间隔）
 * - 输出：`public/data/bulk/nodes-rawg-*.json` + `public/data/bulk/manifest.json`（分片，避免单文件过大）
 *
 * 合规：遵守 RAWG 使用条款与请求配额；商用请查阅其许可。
 *
 * 用法：
 *   RAWG_API_KEY=xxx node scripts/fetch-rawg-games.mjs
 *   MAX_REQUESTS=5000 node scripts/fetch-rawg-games.mjs   # 试跑
 *   CHUNK_SIZE=4000 node scripts/fetch-rawg-games.mjs
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BULK_DIR = join(root, 'public', 'data', 'bulk');

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

// 优先 .env.local（本机私有），再回退 .env
loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env'));

const KEY = process.env.RAWG_API_KEY?.trim();

const MAX_REQUESTS = parseInt(process.env.MAX_REQUESTS || '80000', 10) || 80000;
const MAX_GAMES = parseInt(process.env.MAX_GAMES || '0', 10) || 0;
const CHUNK_SIZE = Math.min(8000, Math.max(2000, parseInt(process.env.CHUNK_SIZE || '5000', 10) || 5000));
const SLEEP_MS = Math.max(120, parseInt(process.env.SLEEP_MS || '280', 10) || 280);
const PAGE_SIZE = 40;

if (!KEY) {
  console.error('请设置 RAWG_API_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rawg(path, searchParams) {
  const u = new URL(path, 'https://api.rawg.io/api/');
  u.searchParams.set('key', KEY);
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  }
  const res = await fetch(u);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`RAWG ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/** 多标签：主机 / PC / 移动 / 街机 可并存 */
function mapRawg(g) {
  const released = g.released;
  const time =
    released && /^\d{4}-\d{2}-\d{2}$/.test(released)
      ? released
      : released?.slice(0, 7)?.match(/^\d{4}-\d{2}$/)
        ? released.slice(0, 7)
        : released?.slice(0, 4) || '2000';

  const platNames = (g.platforms || []).map((x) => x.platform?.name).filter(Boolean);
  const platStr = platNames.join(' ');
  const genreStr = (g.genres || []).map((x) => x.name).join(' ');
  const tagStr = (g.tags || []).map((t) => t.name || t.slug).join(' ');

  const tags = new Set(['game']);
  if (/PC|Linux|macOS|Classic Macintosh|Web/i.test(platStr)) tags.add('PC');
  if (/PlayStation|Xbox|Nintendo|Switch|Wii|GameCube|Dreamcast|SEGA|Genesis|3DS|PS Vita|Commodore/i.test(platStr))
    tags.add('主机');
  if (/iOS|Android/i.test(platStr)) tags.add('移动');
  if (/Arcade/i.test(platStr)) tags.add('街机');
  if (![...tags].some((t) => t === 'PC' || t === '主机' || t === '移动' || t === '街机')) tags.add('主机');

  if (/中国|Chinese/i.test(genreStr + tagStr)) tags.add('中国');
  else if (/Japan|日式|日本|japanese/i.test(genreStr + tagStr + (g.name || ''))) tags.add('日本');
  else tags.add('全球');

  const gl = (genreStr + ' ' + tagStr).toLowerCase();
  if (/indie|独立/.test(gl)) tags.add('独立');
  if (/shooter|fps|射击|第一人称/.test(gl)) tags.add('FPS');
  else if (/rpg|role|角色扮演/.test(gl)) tags.add('RPG');
  else if (/strategy|策略|模拟/.test(gl)) tags.add('策略');
  else if (/casual|puzzle|休闲|益智|card|卡牌/.test(gl)) tags.add('休闲');
  else tags.add('休闲');

  const introRaw =
    g.description_raw?.replace(/<[^>]+>/g, '') ||
    g.description?.replace(/<[^>]+>/g, '') ||
    `${g.name}（RAWG 索引；平台含 ${platNames.slice(0, 4).join('、') || '多平台'}）。`;

  return {
    id: `rawg-${g.id}`,
    time,
    type: 'game',
    title: g.name || '未命名',
    content: {
      intro: introRaw.slice(0, 220),
      details: {
        developer: (g.developers && g.developers[0]?.name) || '不详',
        publisher: (g.publishers && g.publishers[0]?.name) || '见各商店 / RAWG',
        sales: '不详',
        easterEgg: '无',
      },
      imageUrl: g.background_image || '/placeholders/game.svg',
      sourceUrl: g.website || (g.slug ? `https://rawg.io/games/${g.slug}` : 'https://rawg.io/'),
      tags: [...tags],
    },
    relatedNodes: [],
  };
}

async function fetchGenreIndieIds() {
  const ids = new Set();
  let page = 1;
  try {
    while (page <= 25) {
      const data = await rawg('genres', { page, page_size: 40 });
      const results = data.results || [];
      if (!results.length) break;
      for (const g of results) {
        const n = (g.name || '').toLowerCase();
        if (/indie|独立|casual|休闲|puzzle|family|card|board|educat|kids|arcade|platformer|simulate/.test(n)) {
          ids.add(g.id);
        }
      }
      if (!data.next) break;
      page++;
      await sleep(SLEEP_MS);
    }
  } catch {
    /* 忽略 */
  }
  return [...ids];
}

async function fetchParentPlatformIds() {
  const data = await rawg('platforms/lists/parents', { page_size: 20 });
  const ids = (data.results || []).map((p) => p.id).filter(Boolean);
  return ids.length ? ids : [4, 3, 6, 7, 18, 1];
}

function buildStrategies(parentIds, genreIds) {
  const orderings = ['-released', '-added', '-rating', 'name'];

  const strategies = [];

  for (const ordering of orderings) {
    strategies.push({
      label: `all:${ordering}`,
      params: { ordering, page_size: PAGE_SIZE },
    });
  }
  strategies.push({
    label: 'all:oldest',
    params: { ordering: 'released', page_size: PAGE_SIZE },
  });

  for (const pid of parentIds) {
    strategies.push({
      label: `parent:${pid}`,
      params: { ordering: '-released', parent_platforms: pid, page_size: PAGE_SIZE },
    });
    strategies.push({
      label: `parent_added:${pid}`,
      params: { ordering: '-added', parent_platforms: pid, page_size: PAGE_SIZE },
    });
  }

  for (const gid of genreIds) {
    strategies.push({
      label: `genre:${gid}`,
      params: { ordering: '-released', genres: gid, page_size: PAGE_SIZE },
    });
    strategies.push({
      label: `genre_added:${gid}`,
      params: { ordering: '-added', genres: gid, page_size: PAGE_SIZE },
    });
  }

  return strategies;
}

async function main() {
  console.log('正在拉取 RAWG 父平台与流派 id…');
  const [parentIds, genreIds] = await Promise.all([fetchParentPlatformIds(), fetchGenreIndieIds()]);
  console.log('父平台数', parentIds.length, '扩展流派 id', genreIds.join(',') || '(无)');

  const strategies = buildStrategies(parentIds, genreIds);
  console.log('策略数', strategies.length, '（将顺序执行，自动去重 rawg-id）');

  if (existsSync(BULK_DIR)) rmSync(BULK_DIR, { recursive: true });
  mkdirSync(BULK_DIR, { recursive: true });

  const byId = new Map();
  let requestCount = 0;
  let chunkBuf = [];
  let chunkIdx = 0;

  const flushChunk = () => {
    if (!chunkBuf.length) return;
    const fname = `nodes-rawg-${String(chunkIdx).padStart(4, '0')}.json`;
    const fpath = join(BULK_DIR, fname);
    writeFileSync(fpath, JSON.stringify(chunkBuf), 'utf8');
    console.log('写入分片', fname, '条数', chunkBuf.length, '累计唯一', byId.size);
    chunkBuf = [];
    chunkIdx++;
  };

  const addGames = (results) => {
    for (const g of results || []) {
      if (MAX_GAMES > 0 && byId.size >= MAX_GAMES) return false;
      const id = `rawg-${g.id}`;
      if (byId.has(id)) continue;
      byId.set(id, true);
      chunkBuf.push(mapRawg(g));
      if (chunkBuf.length >= CHUNK_SIZE) flushChunk();
    }
    return true;
  };

  const saveManifest = (extra = {}) => {
    const parts = [];
    for (let i = 0; i < chunkIdx; i++) {
      parts.push(`bulk/nodes-rawg-${String(i).padStart(4, '0')}.json`);
    }
    writeFileSync(
      join(BULK_DIR, 'manifest.json'),
      JSON.stringify(
        {
          version: 1,
          source: 'rawg',
          generatedAt: new Date().toISOString(),
          totalGames: byId.size,
          requestCount,
          chunkSize: CHUNK_SIZE,
          parts,
          ...extra,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.log('manifest →', join(BULK_DIR, 'manifest.json'), '分片', parts.length, '唯一游戏', byId.size);
  };

  for (const strat of strategies) {
    if (MAX_GAMES > 0 && byId.size >= MAX_GAMES) break;
    let page = 1;

    while (true) {
      if (requestCount >= MAX_REQUESTS) {
        console.warn('已达 MAX_REQUESTS，停止。提高 MAX_REQUESTS 可继续扩量。');
        flushChunk();
        saveManifest({ partial: true });
        return;
      }
      if (MAX_GAMES > 0 && byId.size >= MAX_GAMES) break;

      let data;
      try {
        data = await rawg('games', { ...strat.params, page });
      } catch (e) {
        console.warn('策略', strat.label, 'page', page, e.message);
        break;
      }
      requestCount++;
      const results = data.results || [];
      if (!results.length) break;

      const cont = addGames(results);
      if (!cont) break;

      if (!data.next) break;
      page++;
      await sleep(SLEEP_MS);
    }

    console.log(
      '完成策略',
      strat.label,
      '当前唯一游戏',
      byId.size,
      'API 次数',
      requestCount,
    );
  }

  flushChunk();
  saveManifest({});
  console.log('完成。唯一游戏', byId.size, 'API 请求', requestCount);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
