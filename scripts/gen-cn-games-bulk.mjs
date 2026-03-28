/**
 * 生成「国内」游戏节点补量（tags 含「中国」），默认至少 1000 条，不设上限由 TARGET 控制。
 * 输出：public/data/bulk/nodes-cn-0000.json
 * 合并：需将 manifest.json 的 parts 包含该文件（脚本可选自动更新）
 *
 * 运行：node scripts/gen-cn-games-bulk.mjs
 *       TARGET=1500 node scripts/gen-cn-games-bulk.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const OUT = join(root, 'public', 'data', 'bulk', 'nodes-cn-0000.json');
const MANIFEST = join(root, 'public', 'data', 'bulk', 'manifest.json');

const TARGET = Math.max(1000, parseInt(process.env.TARGET || '1200', 10) || 1200);
const UPDATE_MANIFEST = process.env.UPDATE_MANIFEST !== '0';

/** 词库组合保证标题多样性（均为虚构或泛化描述，避免冒充具体商业作品） */
const A = [
  '古剑',
  '仙剑',
  '轩辕',
  '幻想',
  '神武',
  '大话',
  '问道',
  '征途',
  '热血',
  '魔域',
  '剑网',
  '天涯',
  '逆水',
  '楚留',
  '一梦',
  '倩女',
  '完美',
  '诛仙',
  '武林',
  '江湖',
  '三国',
  '率土',
  '鸿图',
  '少年',
  '三国志',
  '卧龙',
  '光明',
  '暗影',
  '霓虹',
  '赛博',
  '修仙',
  '凡人',
  '一念',
  '最强',
  '放置',
  '挂机',
  '卡牌',
  '塔防',
  '战术',
  '派对',
  '星穹',
  '灵域',
  '幻域',
  '沧澜',
  '云梦',
  '长歌',
  '墨染',
  '青丘',
  '白泽',
  '烛龙',
];
const B = [
  '奇谭',
  '传说',
  '无双',
  '江湖',
  '仙侠',
  '情缘',
  '战记',
  '远征',
  '觉醒',
  '契约',
  '秘录',
  '编年',
  '风云',
  '霸业',
  '王朝',
  '物语',
  '绘卷',
  '纪元',
  '序章',
  '终章',
  '前传',
  '外传',
  '重制',
  '高清',
  '便携',
  '移动版',
  '口袋版',
  '云游戏',
  '试玩版',
];
const C = [
  '',
  ' II',
  ' III',
  ' Online',
  ' 手游',
  ' 端游',
  '：归来',
  '：重生',
  '：无限',
  '：启程',
];

const STUDIOS = [
  '腾讯游戏',
  '网易游戏',
  '米哈游',
  '鹰角网络',
  '莉莉丝游戏',
  '叠纸游戏',
  '完美世界游戏',
  '西山居',
  '畅游',
  '盛趣游戏',
  '心动网络',
  'bilibili游戏',
  '巨人网络',
  '三七互娱',
  '游族网络',
  '4399',
  '多益网络',
  '祖龙娱乐',
  '中手游',
  '创梦天地',
  '乐元素',
  '英雄互娱',
  '恺英网络',
  '吉比特',
  '青瓷游戏',
  '帕斯亚科技',
  '椰岛游戏',
  '凉屋游戏',
  '烛薪网络',
  '灵游坊',
  'NEXT Studios',
  '腾讯光子',
  '腾讯天美',
  '网易雷火',
  '网易伏羲',
  '独立发行合作',
].filter((v, i, a) => a.indexOf(v) === i);

const GENRES = ['RPG', '策略', '休闲', '独立', 'FPS', 'MOBA', '卡牌', '模拟'];
const PLATS = ['PC', '移动', '主机'];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slug(s) {
  return createHash('sha256').update(s).digest('hex').slice(0, 10);
}

function pickYear(rnd) {
  const u = rnd();
  if (u < 0.05) return 1995 + Math.floor(rnd() * 10);
  if (u < 0.2) return 2005 + Math.floor(rnd() * 10);
  if (u < 0.55) return 2015 + Math.floor(rnd() * 6);
  return 2020 + Math.floor(rnd() * 6);
}

function pickTime(rnd, year) {
  if (rnd() > 0.5) return String(year);
  const m = 1 + Math.floor(rnd() * 12);
  if (rnd() > 0.45) return `${year}-${String(m).padStart(2, '0')}`;
  const d = 1 + Math.floor(rnd() * 28);
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const usedTitles = new Set();
function uniqueTitle(rnd, i) {
  for (let k = 0; k < 80; k++) {
    const a = A[Math.floor(rnd() * A.length)];
    const b = B[Math.floor(rnd() * B.length)];
    const c = C[Math.floor(rnd() * C.length)];
    const t = `《${a}${b}${c}》`.replace(/《《/g, '《');
    if (!usedTitles.has(t)) {
      usedTitles.add(t);
      return t;
    }
  }
  return `《国风样本作品 ${i + 1}号》`;
}

const out = [];
for (let i = 0; i < TARGET; i++) {
  const rnd = mulberry32(0xcafe0000 + i * 0x9e3779b9);
  const title = uniqueTitle(rnd, i);
  const year = pickYear(rnd);
  const time = pickTime(rnd, year);
  const studio = STUDIOS[Math.floor(rnd() * STUDIOS.length)];
  const genre = GENRES[Math.floor(rnd() * GENRES.length)];
  const plat = PLATS[Math.floor(rnd() * PLATS.length)];
  const id = `cn-bulk-${year}-${slug(title + i)}`;

  out.push({
    id,
    time,
    type: 'game',
    title,
    content: {
      intro: `${title}为国内发行时间轴补量条目，侧重反映${year}年前后本土商业与独立游戏的发行密度；具体商号、玩法与成绩请以可查证来源为准，可用 Bangumi 等替换为真实条目。`,
      details: {
        developer: `${studio}（样本）`,
        publisher: `${studio}（样本）`,
        sales: '不详',
        easterEgg: '无',
      },
      imageUrl: '/placeholders/game.svg',
      sourceUrl: 'https://bgm.tv/',
      tags: ['game', '中国', plat, genre],
    },
    relatedNodes: [],
  });
}

writeFileSync(OUT, JSON.stringify(out), 'utf8');
console.log(`已写入 ${OUT} ，共 ${out.length} 条国内游戏补量节点。`);

if (UPDATE_MANIFEST && existsSync(MANIFEST)) {
  const man = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const parts = Array.isArray(man.parts) ? [...man.parts] : [];
  const rel = 'bulk/nodes-cn-0000.json';
  if (!parts.includes(rel)) {
    parts.push(rel);
    man.parts = parts;
  }
  man.generatedAt = new Date().toISOString();
  man.cnBulkGames = out.length;
  if (man.bgmGames == null) {
    try {
      const bgmPath = join(root, 'public', 'data', 'bulk', 'nodes-bgm-0000.json');
      if (existsSync(bgmPath)) {
        const bgm = JSON.parse(readFileSync(bgmPath, 'utf8'));
        man.bgmGames = Array.isArray(bgm) ? bgm.length : 0;
      } else {
        man.bgmGames = man.totalGames || 0;
      }
    } catch {
      man.bgmGames = man.totalGames || 0;
    }
  }
  man.totalGames = (man.bgmGames || 0) + out.length;
  writeFileSync(MANIFEST, JSON.stringify(man, null, 2), 'utf8');
  console.log(`已更新 manifest：parts 含 ${rel}，totalGames=${man.totalGames}（bgm ${man.bgmGames}+ 国内补量 ${out.length}）`);
}
