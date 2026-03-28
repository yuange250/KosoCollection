/**
 * 为节点补全封面图（替换 /placeholders/*.svg）
 * 仅使用国内可访问源：
 * 1) 百度百科开放接口
 * 2) Bangumi（番组计划）搜索接口
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const UA = 'GameHistoryTimeline/1.0 (enrich-images-cn)';

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

const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const BAIDU_SLEEP_MS = Math.max(80, parseInt(process.env.BAIDU_SLEEP_MS || '180', 10) || 180);
const BGM_SLEEP_MS = Math.max(80, parseInt(process.env.BGM_SLEEP_MS || '180', 10) || 180);
const INPUT = process.argv[2] || join(root, 'public', 'data', 'nodes.json');
const PLACEHOLDER_RE = /\/placeholders\/(game|host|event)\.svg$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`);
  }
  return res.json();
}

function buildQueries(title, id) {
  const out = [];
  const t = String(title || '').trim();
  const m = t.match(/《([^》]+)》/);
  if (m) out.push(m[1].trim());
  const plain = t
    .replace(/街机|发售|上市|公测|北美|日本|中国|演示|在 .*$/gu, ' ')
    .replace(/[（(][^)）]+[)）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain) out.push(plain);
  if (id && typeof id === 'string') out.push(id.replace(/-/g, ' '));
  const seen = new Set();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (q.length < 2 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function needsFill(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return true;
  return PLACEHOLDER_RE.test(imageUrl);
}

async function findBaiduBaikeImage(queries, cache) {
  for (const q of queries) {
    const ck = `baike|${q.toLowerCase()}`;
    if (cache.has(ck)) {
      const hit = cache.get(ck);
      if (hit) return { imageUrl: hit, via: `百度百科:${q}` };
      continue;
    }
    try {
      const api = new URL('https://baike.baidu.com/api/openapi/BaikeLemmaCardApi');
      api.searchParams.set('scope', '103');
      api.searchParams.set('format', 'json');
      api.searchParams.set('appid', '379020');
      api.searchParams.set('bk_key', q);
      api.searchParams.set('bk_length', '120');
      const data = await fetchJson(api);
      const picked = data?.image || (Array.isArray(data?.pic) ? data.pic[0]?.url || data.pic[0] : null) || null;
      cache.set(ck, picked);
      if (picked) return { imageUrl: picked, via: `百度百科:${q}` };
    } catch (e) {
      cache.set(ck, null);
      console.warn('  百度百科请求失败', q, e.message);
    }
    await sleep(BAIDU_SLEEP_MS);
  }
  return null;
}

async function findBangumiImage(queries, cache) {
  for (const q of queries) {
    const ck = `bgm|${q.toLowerCase()}`;
    if (cache.has(ck)) {
      const hit = cache.get(ck);
      if (hit) return { imageUrl: hit, via: `Bangumi:${q}` };
      continue;
    }
    try {
      const api = new URL(`https://api.bgm.tv/search/subject/${encodeURIComponent(q)}`);
      api.searchParams.set('type', '4');
      api.searchParams.set('responseGroup', 'small');
      api.searchParams.set('max_results', '8');
      const data = await fetchJson(api);
      const list = Array.isArray(data?.list) ? data.list : [];
      let picked = null;
      for (const s of list) {
        const img = s?.images?.large || s?.images?.common || s?.images?.medium;
        if (img) {
          picked = img;
          break;
        }
      }
      cache.set(ck, picked);
      if (picked) return { imageUrl: picked, via: `Bangumi:${q}` };
    } catch (e) {
      cache.set(ck, null);
      console.warn('  Bangumi 搜索失败', q, e.message);
    }
    await sleep(BGM_SLEEP_MS);
  }
  return null;
}

async function main() {
  if (!existsSync(INPUT)) {
    console.error('文件不存在:', INPUT);
    process.exit(1);
  }
  console.log('模式：仅国内来源（百度百科 + Bangumi）\n');

  const raw = readFileSync(INPUT, 'utf8');
  const nodes = JSON.parse(raw);
  if (!Array.isArray(nodes)) {
    console.error('期望 JSON 数组:', INPUT);
    process.exit(1);
  }

  const baiduCache = new Map();
  const bgmCache = new Map();
  let updated = 0;
  let skipped = 0;
  let stillPlaceholder = 0;

  for (const n of nodes) {
    if (!needsFill(n?.content?.imageUrl)) {
      skipped++;
      continue;
    }
    const queries = buildQueries(n.title, n.id);
    let hit = null;
    if (queries.length) hit = await findBaiduBaikeImage(queries, baiduCache);
    if (!hit && queries.length) hit = await findBangumiImage(queries, bgmCache);

    if (hit) {
      n.content.imageUrl = hit.imageUrl;
      updated++;
      console.log('OK', n.id, '←', hit.via);
    } else {
      stillPlaceholder++;
      console.warn('未找到配图', n.id, n.title);
    }
  }

  console.log('\n完成：更新', updated, '条，跳过', skipped, '条；仍占位约', stillPlaceholder, '条。共', nodes.length, '条');
  if (DRY) {
    console.log('DRY_RUN=1，未写入文件');
    return;
  }
  const bak = `${INPUT}.bak`;
  copyFileSync(INPUT, bak);
  writeFileSync(INPUT, `${JSON.stringify(nodes, null, 2)}\n`, 'utf8');
  console.log('已备份', bak);
  console.log('已写入', INPUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
