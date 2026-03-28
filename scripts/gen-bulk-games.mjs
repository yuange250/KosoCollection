/**
 * 生成补量游戏节点（程序化样本），使「游戏」类条目共至少 target 条（默认 5000）。
 * 与 public/data/nodes.json 中的精编条目合并使用；后续可用 RAWG/IGDB 替换。
 *
 * 运行：node scripts/gen-bulk-games.mjs
 * 可选：TARGET=5000 node scripts/gen-bulk-games.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const CURATED = join(root, 'public', 'data', 'nodes.json');
const OUT = join(root, 'public', 'data', 'nodes-bulk.json');

const TARGET = Math.max(5000, parseInt(process.env.TARGET || '5000', 10) || 5000);

const PRE = [
  '星际',
  '暗影',
  '永恒',
  '逆转',
  '量子',
  '异能',
  '赛博',
  '像素',
  '苍穹',
  '深渊',
  '霓虹',
  '荒野',
  '极地',
  '沙海',
  '龙语',
  '剑心',
  '魔域',
  '灵域',
  '破晓',
  '沉默',
  '狂飙',
  '零日',
  '镜像',
  '虚境',
  '源初',
];
const MID = [
  '战纪',
  '编年史',
  '协定',
  '远征',
  '边境',
  '觉醒',
  '裂痕',
  '回响',
  '契约',
  '前线',
  '密令',
  '秘典',
  '废墟',
  '风暴',
  '黎明',
  '终章',
  '轮回',
  '序列',
  '协议',
  '纪元',
  '余烬',
  '领航',
  '倒影',
  '幻阵',
];
const SUF = ['', ' II', ' III', '：重制版', '：高清版', ' 导演剪辑版', ' Online', ' 便携版'];

const GENRES_TAG = ['FPS', 'RPG', '策略', '独立', '休闲'];
const PLAT = ['主机', 'PC', '移动', '街机'];
const REG = ['中国', '日本', '欧美', '全球'];

const PUB = [
  '示例发行 A',
  '示例发行 B',
  'Indie Collective',
  'Pixel Foundry',
  'Nordic Byte',
  'Pacific Label',
  '移动端联运',
];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 偏向近年（模拟行业发行密度上升） */
function pickYear(rnd) {
  const u = rnd();
  if (u < 0.04) return 1970 + Math.floor(rnd() * 15);
  if (u < 0.12) return 1985 + Math.floor(rnd() * 15);
  if (u < 0.28) return 2000 + Math.floor(rnd() * 15);
  if (u < 0.52) return 2015 + Math.floor(rnd() * 8);
  return 2020 + Math.floor(rnd() * 6);
}

function pickMonthDay(rnd, year) {
  if (rnd() > 0.55) return `${year}`;
  const m = 1 + Math.floor(rnd() * 12);
  if (rnd() > 0.4) return `${year}-${String(m).padStart(2, '0')}`;
  const d = 1 + Math.floor(rnd() * 28);
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function slug(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

const curated = JSON.parse(readFileSync(CURATED, 'utf8'));
const gameCount = curated.filter((n) => n.type === 'game').length;
const need = Math.max(0, TARGET - gameCount);

if (need === 0) {
  console.log(`精编游戏中已有 ${gameCount} 款 ≥ ${TARGET}，跳过写入。`);
  writeFileSync(OUT, '[]', 'utf8');
  process.exit(0);
}

const out = [];
for (let i = 0; i < need; i++) {
  const rnd = mulberry32(0x9e3779b9 + i * 0x517cc1b7);
  const pre = PRE[Math.floor(rnd() * PRE.length)];
  const mid = MID[Math.floor(rnd() * MID.length)];
  const suf = SUF[Math.floor(rnd() * SUF.length)];
  const title = `《${pre}${mid}${suf}》`;
  const year = pickYear(rnd);
  const time = pickMonthDay(rnd, year);
  const genre = GENRES_TAG[Math.floor(rnd() * GENRES_TAG.length)];
  const plat = PLAT[Math.floor(rnd() * PLAT.length)];
  const reg = REG[Math.floor(rnd() * REG.length)];
  const pub = PUB[Math.floor(rnd() * PUB.length)];
  const id = `gen-${year}-${slug(pre + mid + suf + i)}`;

  out.push({
    id,
    time,
    type: 'game',
    title: title.replace(/《《/g, '《').replace(/》》/g, '》'),
    content: {
      intro: `${title}为时间轴批量扩充样本，定位${year}年前后${genre}向作品，用于观察发行密度趋势；可改用 Bangumi 等可访问数据源替换为可查证条目。`,
      details: {
        developer: `${pub} 工作室群`,
        publisher: pub,
        sales: '不详',
        easterEgg: '无',
      },
      imageUrl: '/placeholders/game.svg',
      sourceUrl: 'https://bgm.tv/',
      tags: [plat, reg, 'game', genre].filter((v, j, a) => a.indexOf(v) === j),
    },
    relatedNodes: [],
  });
}

writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log(`精编游戏 ${gameCount} 款，已生成补量 ${need} 款 → ${OUT}（合计游戏 ${gameCount + need}）`);
console.log('说明：程序化数据仅供密度/交互测试；生产可改用 scripts/fetch-bgm-games-cn.mjs 获取可查证条目。');
