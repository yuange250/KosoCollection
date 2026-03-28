import type { TimelineNode, ZoomLayer } from '@/types/timeline';
const DECADE_RE = /^(\d{4})s$/;
const YEAR_RE = /^(\d{4})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Map PRD time string to fractional year for positioning. */
export function timeToYearFraction(time: string): number {
  const t = time.trim();
  const d = DECADE_RE.exec(t);
  if (d) return parseInt(d[1], 10) + 5;
  const y = YEAR_RE.exec(t);
  if (y) return parseInt(y[1], 10) + 0.5;
  const m = MONTH_RE.exec(t);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    return year + month / 12 + 1 / 24;
  }
  const day = DAY_RE.exec(t);
  if (day) {
    const year = parseInt(day[1], 10);
    const month = parseInt(day[2], 10) - 1;
    const ddate = parseInt(day[3], 10);
    const start = Date.UTC(year, month, ddate);
    const startYear = Date.UTC(year, 0, 1);
    const nextYear = Date.UTC(year + 1, 0, 1);
    return year + (start - startYear) / (nextYear - startYear);
  }
  return 2000;
}

export function spanToLayer(spanYears: number): ZoomLayer {
  if (spanYears >= 45) return 'decade';
  if (spanYears >= 4) return 'year';
  return 'day';
}

export function layerHintFromWheel(deltaY: number, current: ZoomLayer): ZoomLayer {
  if (deltaY < 0) {
    switch (current) {
      case 'decade':
        return 'year';
      case 'year':
        return 'day';
      default:
        return 'day';
    }
  }
  switch (current) {
    case 'day':
      return 'year';
    case 'year':
      return 'decade';
    default:
      return 'decade';
  }
}

/** Preset domain span (years) for each layer when user "snaps". */
export function targetSpanForLayer(layer: ZoomLayer, center: number): [number, number] {
  const half = layer === 'decade' ? 40 : layer === 'year' ? 6 : 0.35;
  return [center - half, center + half];
}

const YEAR_ANCHOR = 1958;
const YEAR_CEIL = new Date().getFullYear() + 0.5;

/** 根据节点时间分布计算初始可视区间（加比例留白），用于减少左右大片空档。 */
export function initialDomainFromNodes(nodes: TimelineNode[], padRatio = 0.06): [number, number] {
  if (!nodes.length) return [YEAR_ANCHOR, YEAR_ANCHOR + 42];
  const ys = nodes.map((n) => timeToYearFraction(n.time));
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const span = Math.max(hi - lo, 0.5);
  const pad = Math.max(span * padRatio, 0.75);
  lo = Math.max(YEAR_ANCHOR, lo - pad);
  hi = Math.min(YEAR_CEIL, hi + pad);
  if (hi <= lo) hi = Math.min(YEAR_CEIL, lo + 8);
  return [lo, hi];
}

/** 将 [d0,d1] 均分为若干时间片，用于热度统计（与缩放联动）。 */
export function equalTimeBins(d0: number, d1: number, binCount: number): Array<{ start: number; end: number }> {
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);
  const n = Math.max(2, Math.min(80, Math.floor(binCount)));
  const w = (hi - lo) / n;
  const bins: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < n; i++) {
    const start = lo + i * w;
    const end = i === n - 1 ? hi : lo + (i + 1) * w;
    bins.push({ start, end });
  }
  return bins;
}