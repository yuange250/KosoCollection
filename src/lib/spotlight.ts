import { timeToYearFraction, spanToLayer } from '@/lib/time';
import type { TimelineNode, ZoomLayer } from '@/types/timeline';

/** 与 Timeline 圆点一致的横向微偏移，避免同时间多点重叠 */
export function hashJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(31, h) + id.charCodeAt(i);
  return ((h % 1000) / 1000 - 0.5) * 0.18;
}

/** 圆点/卡片的像素 x（相对视口左缘，与 SVG translate 后一致） */
export function nodePixelX(
  n: TimelineNode,
  domain: [number, number],
  innerWidth: number,
  marginLeft: number,
): number {
  const [d0, d1] = domain;
  const span = Math.max(d1 - d0, 1e-6);
  const t = timeToYearFraction(n.time) + hashJitter(n.id);
  return marginLeft + ((t - d0) / span) * innerWidth;
}

/**
 * 内置：游戏史上常被视为里程碑的节点 id → 权重（可与 JSON 里 importance 叠加）
 */
export const SPOTLIGHT_PRESET: Record<string, number> = {
  'tennis-for-two': 100,
  spacewar: 96,
  pong: 98,
  'magnavox-odyssey': 92,
  'atari-inc': 88,
  'atari-2600': 90,
  'atari-shock': 94,
  'nes-jp': 97,
  'smb-jp': 99,
  'nes-na': 93,
  'zelda-86': 95,
  ff1: 91,
  'gb-1989': 89,
  'tetris-gb': 90,
  'snes-launch': 94,
  'sonic-1991': 92,
  'street-fighter2': 91,
  wolf3d: 88,
  'doom-1993': 96,
  'chrono-trigger': 93,
  'quake-96': 90,
  'evolution-3d': 85,
  'ps1-launch': 97,
  ff7: 99,
  'n64-launch': 95,
  mario64: 98,
  oot: 99,
  'half-life': 97,
  'pokemon-rg': 96,
  'wow-launch': 98,
  'cn-xiaobawang': 82,
  'cn-netbar': 84,
  'cn-2000s-mmo': 86,
  'cn-mobile-2010s': 88,
  'gba-2001': 87,
  'ds-2004': 89,
  xbox360: 91,
  'ps3-launch': 92,
  'wii-launch': 96,
  minecraft: 99,
  'switch-2017': 97,
  botw: 100,
  'indie-renaissance': 86,
  'vr-waves': 84,
  'ps5-launch': 94,
  'computer-space': 78,
  'space-invaders': 94,
  galaxian: 82,
  'pac-man': 96,
  'donkey-kong': 93,
  'ms-pac-man': 85,
  pitfall: 84,
  'dragon-quest-1': 92,
  castlevania: 88,
  'metroid-nes': 91,
  contra: 89,
  'mega-man-2': 87,
  'ff4-snes': 90,
  'civilization-1991': 88,
  'alone-in-the-dark': 86,
  'myst-1993': 91,
  'warcraft-1994': 90,
  'wipeout-1995': 85,
  'resident-evil-96': 94,
  'tomb-raider-96': 92,
  'gt-1997': 90,
  'goldeneye-007': 93,
  'starcraft-98': 97,
  'metal-gear-solid-98': 96,
  'silent-hill-99': 90,
  'the-sims-2000': 94,
  'sim-city-snesc': 86,
  gta3: 97,
  'devil-may-cry': 90,
  'kingdom-hearts': 91,
  ff10: 93,
  'war3-2002': 95,
  'halo-2': 94,
  'resident-evil-4': 96,
  'oblivion-2006': 93,
  'mass-effect': 92,
  'kotor-2003': 91,
  'cod4-2007': 95,
  'portal-2007': 96,
  'left-4-dead': 92,
  'plants-vs-zombies-2009': 90,
  'angry-birds': 91,
  'demon-souls': 93,
  'dark-souls': 97,
  'skyrim-2011': 98,
  'journey-2012': 91,
  'gta5-2013': 99,
  'tlou-2013': 97,
  'last-of-us': 94,
  bloodborne: 95,
  witcher3: 98,
  'overwatch-2016': 93,
  'tf2-2007': 90,
  pubg: 96,
  'fortnite-br': 97,
  'god-of-war-2018': 96,
  rdr2: 99,
  acnh: 96,
  'genshin-impact': 94,
  'honkai-star-rail': 88,
  'elden-ring': 99,
  bg3: 98,
  'divinity-os2': 90,
  'cyberpunk-2077': 94,
  'metal-gear-solid-2': 92,
  'shadow-colossus': 94,
  bayonetta: 91,
  fallout3: 92,
  'battlefield-3': 90,
  'battlefield-1942': 88,
  'mega-drive-jp': 88,
  'saturn-jp': 82,
  'dreamcast-jp': 90,
  'ps2-jp': 96,
  'xbox-na': 88,
  'psp-jp': 86,
  'e3-1995': 84,
  'steam-launch-2003': 92,
  'sega-hardware-exit-2001': 88,
  'igf-1998': 78,
  'kojima-prod-2015': 86,
  'carmack-oculus-2013': 82,
  'miyamoto-bafta-2010': 84,
};

function heuristicScore(n: TimelineNode): number {
  const base = n.type === 'event' ? 28 : n.type === 'host' ? 26 : 22;
  const rel = Math.min(18, (n.relatedNodes?.length ?? 0) * 3);
  return base + rel;
}

export function nodeSpotlightScore(n: TimelineNode): number {
  const manual = n.importance;
  const preset = SPOTLIGHT_PRESET[n.id];
  if (manual != null && preset != null) return Math.max(manual, preset);
  if (manual != null) return manual;
  if (preset != null) return preset;
  return heuristicScore(n);
}

function inDomain(n: TimelineNode, d0: number, d1: number): boolean {
  const t = timeToYearFraction(n.time);
  return t >= d0 && t <= d1;
}

/** 按像素中心距去重，避免卡片叠在一起 */
function pickNonOverlapping(
  ranked: TimelineNode[],
  domain: [number, number],
  innerPx: number,
  maxTotal: number,
  minCenterGapPx: number,
): TimelineNode[] {
  const [d0, d1] = domain;
  const span = Math.max(d1 - d0, 1e-6);
  const picked: TimelineNode[] = [];
  const centers: number[] = [];
  for (const n of ranked) {
    if (picked.length >= maxTotal) break;
    const t = timeToYearFraction(n.time) + hashJitter(n.id);
    const cx = ((t - d0) / span) * innerPx;
    if (centers.some((c) => Math.abs(cx - c) < minCenterGapPx)) continue;
    picked.push(n);
    centers.push(cx);
  }
  return picked;
}

/** 全局/十年视图下左侧时间带节点偏少时，从高分候选中补足，避免左侧大片留白 */
function enrichEarlyBand(
  picked: TimelineNode[],
  ranked: TimelineNode[],
  domain: [number, number],
  innerPx: number,
  minGapPx: number,
  maxTotal: number,
): TimelineNode[] {
  const [d0, d1] = domain;
  const span = Math.max(d1 - d0, 1e-6);
  if (span < 38 || innerPx < 400) return picked;

  const leftPx = innerPx * 0.36;
  const earlyEnd = d0 + span * 0.42;

  const countInLeft = (list: TimelineNode[]) =>
    list.filter((n) => {
      const t = timeToYearFraction(n.time) + hashJitter(n.id);
      const cx = ((t - d0) / span) * innerPx;
      return cx < leftPx && t <= earlyEnd;
    }).length;

  if (countInLeft(picked) >= 4 || picked.length >= maxTotal) return picked;

  const out = [...picked];
  const ids = new Set(out.map((n) => n.id));
  const centers = out.map((n) => {
    const t = timeToYearFraction(n.time) + hashJitter(n.id);
    return ((t - d0) / span) * innerPx;
  });

  for (const n of ranked) {
    if (out.length >= maxTotal) break;
    if (ids.has(n.id)) continue;
    const t = timeToYearFraction(n.time) + hashJitter(n.id);
    if (t > earlyEnd) continue;
    const cx = ((t - d0) / span) * innerPx;
    if (cx >= leftPx) continue;
    if (centers.some((c) => Math.abs(cx - c) < minGapPx)) continue;
    out.push(n);
    ids.add(n.id);
    centers.push(cx);
    if (countInLeft(out) >= 5) break;
  }
  return out;
}

function slotsPerSide(iw: number, layer: ZoomLayer): number {
  const minCard = layer === 'decade' ? 148 : layer === 'year' ? 136 : 122;
  const raw = Math.floor(iw / minCard);
  const cap = layer === 'decade' ? 8 : layer === 'year' ? 10 : 12;
  return Math.max(1, Math.min(cap, raw));
}

export interface SpotlightSplit {
  /** 圆点上方 */
  above: TimelineNode[];
  /** 圆点下方 */
  below: TimelineNode[];
}

export function computeSpotlightSplit(
  nodes: TimelineNode[],
  domain: [number, number],
  innerWidth: number,
): SpotlightSplit {
  const [d0, d1] = domain;
  const span = d1 - d0;
  const layer = spanToLayer(span);
  const perSide = slotsPerSide(innerWidth, layer);
  const maxTotal = Math.min(perSide * 2, 24);

  const inView = nodes.filter((n) => inDomain(n, d0, d1));
  const ranked = [...inView].sort((a, b) => nodeSpotlightScore(b) - nodeSpotlightScore(a));

  const minGap = layer === 'decade' ? 74 : layer === 'year' ? 82 : 72;
  let picked = pickNonOverlapping(ranked, domain, innerWidth, maxTotal, minGap);
  picked = enrichEarlyBand(picked, ranked, domain, innerWidth, minGap, maxTotal);

  // 下方空间要给热度曲线和轴标签，默认将更多卡片放在上方
  const aboveCount = Math.max(1, Math.ceil(picked.length * 0.72));
  return {
    above: picked.slice(0, aboveCount),
    below: picked.slice(aboveCount),
  };
}
