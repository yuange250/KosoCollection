/**
 * 旅行类展示用图（Unsplash CDN，Unsplash License 允许免费使用含商业场景）。
 * 非具体 POI 官方图，用于替代不可用的 Wikimedia 外链；风格接近 OTA/攻略站配图。
 * 本地缓存：`npm run cache:project2-unsplash` 写入 `project2StockCached.gen.ts` 与 `public/images/project2/stock-*`。
 * @see https://unsplash.com/license
 */
import { PROJECT2_STOCK_LOCAL } from './project2StockCached.gen';

/** 需带 ixlib，否则 images.unsplash.com 常返回 404（imgix）。 */
const q = 'ixlib=rb-4.1.0&auto=format&fit=crop&w=1400&q=82';

const u = (photoId: string) => `https://images.unsplash.com/photo-${photoId}?${q}`;

/**
 * 经 imgix 仍可 200 的 photo id（旧 id 大量已 404）。各主题池由此列表轮换生成，避免单池死链。
 */
const WORKING = [
  '1682687220742-aba13b6e50ba',
  '1618005182384-a83a8bd57fbe',
  '1606761568499-6d2451b23c66',
  '1586023492125-27b2c045efd7',
  '1566073771259-6a8506099945',
  '1515542622106-78bda8ba0e5b',
  '1578662996442-48f60103fc96',
  '1503174971373-b1f69850bded',
  '1502602898657-3e91760cbb34',
  '1506905925346-21bda4d32df4',
  '1469474968028-56623f02e42e',
] as const;

function stockPool(phase: number): readonly string[] {
  const w = WORKING;
  return Array.from({ length: 24 }, (_, i) => u(w[(i + phase) % w.length]!));
}

const POOLS = {
  heritage: stockPool(0),
  nature: stockPool(2),
  city: stockPool(5),
  coast: stockPool(8),
} as const;

export type StockKind = keyof typeof POOLS;

function hashId(pointId: string): number {
  let h = 0;
  for (let i = 0; i < pointId.length; i += 1) {
    h = Math.imul(31, h) + pointId.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** 为同一景点稳定选取若干张旅行风配图（同 id 同结果）。若已跑缓存脚本则优先用本地路径。 */
export function pickStockGalleryUrls(pointId: string, kind: StockKind, count: number): string[] {
  const cached = PROJECT2_STOCK_LOCAL[pointId];
  if (cached?.length) {
    const n = Math.min(count, cached.length);
    return [...cached].slice(0, n);
  }

  const pool = POOLS[kind];
  const h = hashId(pointId);
  const out: string[] = [];
  const used = new Set<number>();
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i += 1) {
    let idx = (h + i * 1_103_515_245) % pool.length;
    let guard = 0;
    while (used.has(idx) && guard < pool.length) {
      idx = (idx + 1) % pool.length;
      guard += 1;
    }
    used.add(idx);
    out.push(pool[idx]!);
  }
  return out;
}
