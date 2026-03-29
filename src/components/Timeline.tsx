import * as d3 from 'd3';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  equalTimeBins,
  spanToLayer,
  targetSpanForLayer,
  timeToYearFraction,
} from '@/lib/time';
import { computeSpotlightSplit, hashJitter } from '@/lib/spotlight';
import {
  HEAT_GAP,
  HEAT_H,
  NODE_BAND_H,
  NODE_BAND_TOP,
  TIMELINE_MARGIN as MARGIN,
  TIMELINE_SVG_HEIGHT,
} from '@/lib/timelineLayout';
import type { TimelineNode } from '@/types/timeline';
import { SpotlightOverlay } from '@/components/SpotlightOverlay';

const YEAR_MIN = 1958;
const YEAR_MAX = new Date().getFullYear() + 0.5;

const COLOR: Record<string, string> = {
  game: '#fb923c',
  host: '#38bdf8',
  event: '#4ade80',
};

function clampDomain(a: number, b: number): [number, number] {
  let lo = Math.min(a, b);
  let hi = Math.max(a, b);
  const minSpan = 0.08;
  const maxSpan = YEAR_MAX - YEAR_MIN;
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  if (hi - lo > maxSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - maxSpan / 2;
    hi = mid + maxSpan / 2;
  }
  lo = Math.max(YEAR_MIN, lo);
  hi = Math.min(YEAR_MAX, hi);
  if (hi <= lo) hi = Math.min(YEAR_MAX, lo + minSpan);
  return [lo, hi];
}

/** 拖拽平移专用：尽量保持跨度不变，避免边界出现“缩放感” */
function clampPanDomain(a: number, b: number): [number, number] {
  let lo = Math.min(a, b);
  let hi = Math.max(a, b);
  const span = Math.max(hi - lo, 0.08);
  const maxSpan = YEAR_MAX - YEAR_MIN;
  const s = Math.min(span, maxSpan);
  if (lo < YEAR_MIN) {
    lo = YEAR_MIN;
    hi = lo + s;
  }
  if (hi > YEAR_MAX) {
    hi = YEAR_MAX;
    lo = hi - s;
  }
  lo = Math.max(YEAR_MIN, lo);
  hi = Math.min(YEAR_MAX, hi);
  if (hi <= lo) hi = Math.min(YEAR_MAX, lo + 0.08);
  return [lo, hi];
}

function smoothSeries(values: number[]): number[] {
  if (values.length <= 2) return values.slice();
  const k = [1, 2, 3, 2, 1];
  const out = values.map((_, i) => {
    let num = 0;
    let den = 0;
    for (let j = -2; j <= 2; j++) {
      const p = i + j;
      if (p < 0 || p >= values.length) continue;
      const w = k[j + 2];
      num += (values[p] ?? 0) * w;
      den += w;
    }
    return den > 0 ? num / den : values[i] ?? 0;
  });
  let lastNonZero = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    if ((values[i] ?? 0) > 0) {
      lastNonZero = i;
      break;
    }
  }
  if (lastNonZero >= 0 && lastNonZero < out.length - 1) {
    const tailStart = Math.max(lastNonZero, out.length - 6);
    const base = out[lastNonZero] ?? 0;
    for (let i = tailStart; i < out.length; i++) {
      const t = (i - tailStart + 1) / (out.length - tailStart + 1);
      const fade = 1 - t * t * t;
      out[i] = Math.max(0, Math.min(out[i] ?? 0, base * fade));
    }
  }
  return out;
}

function monthTicks(lo: number, hi: number): { v: number; label: string }[] {
  const out: { v: number; label: string }[] = [];
  const y0 = Math.floor(lo);
  const y1 = Math.ceil(hi);
  for (let y = y0; y <= y1; y++) {
    for (let m = 0; m < 12; m++) {
      const v = y + m / 12 + 1 / 24;
      if (v < lo || v > hi) continue;
      out.push({
        v,
        label: `${y}-${String(m + 1).padStart(2, '0')}`,
      });
    }
  }
  return out;
}

interface Props {
  nodes: TimelineNode[];
  onSelect: (n: TimelineNode) => void;
  focusId?: string | null;
  onFocusConsumed?: () => void;
}

export function Timeline({ nodes, onSelect, focusId, onFocusConsumed }: Props) {
  const heatGradId = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const domainRef = useRef<[number, number]>([YEAR_MIN, YEAR_MAX]);

  const innerH = TIMELINE_SVG_HEIGHT;

  const [size, setSize] = useState({ w: 1000, h: innerH });
  const [domain, setDomain] = useState<[number, number]>(() => [YEAR_MIN, YEAR_MAX]);
  const [hint, setHint] = useState<TimelineNode | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; d0: number; d1: number } | null>(null);

  domainRef.current = domain;

  const innerW = size.w - MARGIN.left - MARGIN.right;
  const spotlight = useMemo(
    () => computeSpotlightSplit(nodes, domain, innerW),
    [nodes, domain, innerW],
  );
  const spotlightMotionKey = `${domain[0].toFixed(4)}-${domain[1].toFixed(4)}`;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const s = d3.select(svg);
    if (s.select('g.root').empty()) s.append('g').attr('class', 'root');
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(280, r.width), h: innerH });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.max(280, r.width), h: innerH });
    return () => ro.disconnect();
  }, [innerH]);

  useEffect(() => {
    if (!focusId || !nodes.length) return;
    const n = nodes.find((x) => x.id === focusId);
    if (!n) return;
    const c = timeToYearFraction(n.time);
    const [lo, hi] = targetSpanForLayer('day', c);
    setDomain(clampDomain(lo, hi));
    onFocusConsumed?.();
  }, [focusId, nodes, onFocusConsumed]);

  const span = domain[1] - domain[0];
  const currentLayer = spanToLayer(span);
  const nodeRadius = currentLayer === 'decade' ? 5 : currentLayer === 'year' ? 7 : 9;
  const projectYearLocal = useMemo(() => {
    const sx = d3.scaleLinear().domain(domain).range([0, innerW]);
    return (v: number) => sx(v);
  }, [domain, innerW]);
  const projectNodeX = useCallback(
    (n: TimelineNode) => MARGIN.left + projectYearLocal(timeToYearFraction(n.time) + hashJitter(n.id)),
    [projectYearLocal],
  );

  const nodeY = MARGIN.top + NODE_BAND_TOP + NODE_BAND_H * 0.48;
  const heatY0 = MARGIN.top + NODE_BAND_TOP + NODE_BAND_H + HEAT_GAP;
  const heatY1 = heatY0 + HEAT_H;
  const axisY = heatY1 + 8;

  const redraw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !nodes.length) return;
    const { w } = size;
    const iw = w - MARGIN.left - MARGIN.right;
    const currentLayer = spanToLayer(span);

    const g = d3.select(svg).select<SVGGElement>('g.root');
    g.selectAll('*').remove();
    const root = g.attr('transform', `translate(${MARGIN.left},0)`);

    const defs = root.insert('defs', ':first-child');
    const grad = defs
      .append('linearGradient')
      .attr('id', heatGradId)
      .attr('x1', '0')
      .attr('x2', '0')
      .attr('y1', '1')
      .attr('y2', '0');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#22d3ee').attr('stop-opacity', 0.08);
    grad.append('stop').attr('offset', '50%').attr('stop-color', '#fb923c').attr('stop-opacity', 0.35);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#e879f9').attr('stop-opacity', 0.55);

    const ticks: { v: number; label: string }[] = [];
    if (currentLayer === 'decade') {
      for (let y = 1950; y <= 2030; y += 10) {
        if (y + 10 < domain[0] || y > domain[1]) continue;
        ticks.push({ v: y + 5, label: `${y}s` });
      }
    } else if (currentLayer === 'year') {
      const y0 = Math.floor(domain[0]);
      const y1 = Math.ceil(domain[1]);
      for (let y = y0; y <= y1; y++) {
        if (y < domain[0] || y > domain[1]) continue;
        ticks.push({ v: y + 0.5, label: `${y}` });
      }
    } else {
      const mt = monthTicks(domain[0], domain[1]);
      const step = Math.max(1, Math.ceil(mt.length / 14));
      ticks.push(...mt.filter((_, i) => i % step === 0));
    }

    const axisG = root.append('g').attr('class', 'axis');
    axisG
      .selectAll('line.tick')
      .data(ticks)
      .join('line')
      .attr('class', 'tick')
      .attr('x1', (d) => projectYearLocal(d.v))
      .attr('x2', (d) => projectYearLocal(d.v))
      .attr('y1', axisY)
      .attr('y2', axisY + 8)
      .attr('stroke', '#5b6a8a');

    axisG
      .selectAll('text.tick')
      .data(ticks)
      .join('text')
      .attr('class', 'tick')
      .attr('x', (d) => projectYearLocal(d.v))
      .attr('y', axisY + 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', currentLayer === 'day' ? 9 : 11)
      .text((d) => d.label);

    root
      .append('line')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', axisY)
      .attr('y2', axisY)
      .attr('stroke', 'rgba(148, 163, 184, 0.35)');

    root
      .append('text')
      .attr('x', 0)
      .attr('y', 18)
      .attr('fill', '#f1f5f9')
      .attr('font-size', 17)
      .attr('font-weight', 700)
      .text('游戏史时间轴');

    const layerLabel =
      currentLayer === 'decade' ? '十年视图' : currentLayer === 'year' ? '年份视图' : '月日视图';
    root
      .append('text')
      .attr('x', iw)
      .attr('y', 34)
      .attr('text-anchor', 'end')
      .attr('fill', '#7dd3fc')
      .attr('font-size', 12)
      .text(`${layerLabel} · 滚轮缩放 · 拖拽平移`);

    const games = nodes.filter((n) => n.type === 'game');
    const binTarget = Math.floor(iw / 9);
    const bins = equalTimeBins(domain[0], domain[1], binTarget);
    const counts = bins.map((b, i) => {
      const last = i === bins.length - 1;
      return games.filter((n) => {
        const t = timeToYearFraction(n.time);
        if (last) return t >= b.start && t <= b.end;
        return t >= b.start && t < b.end;
      }).length;
    });
    const smoothedCounts = smoothSeries(counts);
    const maxC = Math.max(1, d3.max(smoothedCounts) ?? 1);
    const yHeat = d3.scaleLinear().domain([0, maxC * 1.12]).range([heatY1 - 4, heatY0 + 6]);

    const centers = bins.map((b) => (b.start + b.end) / 2);
    const linePts: [number, number][] = centers.map((cx, i) => [projectYearLocal(cx), yHeat(smoothedCounts[i] ?? 0)]);
    if (linePts.length >= 1) {
      const linePath = d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveMonotoneX);
      const areaFn = d3
        .area<[number, number]>()
        .x((d) => d[0])
        .y0(heatY1 - 4)
        .y1((d) => d[1])
        .curve(d3.curveMonotoneX);

      const heatG = root.append('g').attr('class', 'heat-layer');

      if (linePts.length >= 2) {
        heatG
          .append('path')
          .attr('fill', `url(#${heatGradId})`)
          .attr('stroke', 'none')
          .attr('d', areaFn(linePts) ?? '');
      }

      heatG
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', '#f97316')
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
        .attr('d', linePts.length >= 2 ? linePath(linePts) ?? '' : 'M' + linePts[0][0] + ',' + linePts[0][1] + 'h0');

      heatG
        .append('text')
        .attr('x', 0)
        .attr('y', heatY0 - 2)
        .attr('fill', '#fdba74')
        .attr('font-size', 11)
        .attr('font-weight', 600)
        .text(`游戏发行热度（当前视野 · ${games.length} 款游戏样本）`);
    }

    const visBottom = MARGIN.top + NODE_BAND_TOP + NODE_BAND_H;
    root
      .append('line')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', visBottom)
      .attr('y2', visBottom)
      .attr('stroke', 'rgba(148, 163, 184, 0.25)')
      .attr('stroke-dasharray', '4 4');

    const visible = nodes.filter((n) => {
      const t = timeToYearFraction(n.time) + hashJitter(n.id);
      return t >= domain[0] && t <= domain[1];
    });
    const spotlightIds = new Set([...spotlight.above, ...spotlight.below].map((n) => n.id));
    const maxDots = currentLayer === 'decade' ? 220 : currentLayer === 'year' ? 400 : 520;
    const step = Math.max(1, Math.ceil(visible.length / maxDots));
    const sampled = visible.filter((_, i) => i % step === 0);
    const sampledIds = new Set(sampled.map((n) => n.id));
    const forcedSpotlight = visible.filter((n) => spotlightIds.has(n.id) && !sampledIds.has(n.id));
    const thinned = [...sampled, ...forcedSpotlight].sort((a, b) => {
      const ta = timeToYearFraction(a.time) + hashJitter(a.id);
      const tb = timeToYearFraction(b.time) + hashJitter(b.id);
      return ta - tb;
    });
    const rScale = currentLayer === 'decade' ? 5 : currentLayer === 'year' ? 7 : 9;

    root
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGCircleElement, TimelineNode>('circle')
      .data(thinned, (d) => d.id)
      .join('circle')
      .attr('cx', (d) => projectYearLocal(timeToYearFraction(d.time) + hashJitter(d.id)))
      .attr('cy', nodeY)
      .attr('r', rScale)
      .attr('fill', (d) => COLOR[d.type] ?? '#64748b')
      .attr('stroke', 'rgba(15, 23, 42, 0.9)')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .style('transition', 'r 0.35s ease')
      .on('click', (_, d) => onSelect(d))
      .on('mouseenter', (_, d) => setHint(d))
      .on('mouseleave', () => setHint(null));
  }, [axisY, heatY0, heatY1, nodeY, nodes, onSelect, projectYearLocal, size.w, span, spotlight]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;

    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      const dom = domainRef.current;
      const rect = root.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const iw = size.w - MARGIN.left - MARGIN.right;
      const rx = Math.min(Math.max(mx - MARGIN.left, 0), iw) / Math.max(iw, 1);
      const focal = dom[0] + rx * (dom[1] - dom[0]);
      const factor = ev.deltaY < 0 ? 0.88 : 1.12;
      const lo = focal + (dom[0] - focal) * factor;
      const hi = focal + (dom[1] - focal) * factor;
      setDomain(clampDomain(lo, hi));
    };

    /* 捕获阶段 + 绑定在外层：覆盖 spotlight 卡片等区域，避免滚轮穿透导致整页上下滚动 */
    root.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => root.removeEventListener('wheel', onWheel, true);
  }, [size.w]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, d0: domain[0], d1: domain[1] };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const iw = size.w - MARGIN.left - MARGIN.right;
    const spanYears = d.d1 - d.d0;
    const pxPerYear = iw / Math.max(spanYears, 1e-6);
    const deltaYears = -dx / pxPerYear;
    setDomain(clampPanDomain(d.d0 + deltaYears, d.d1 + deltaYears));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ok */
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div ref={wrapRef} className="timeline-wrap">
      <div className="timeline-chart-stack">
        <svg
          ref={svgRef}
          width="100%"
          height={size.h}
          className="timeline-svg"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' }}
        />
        <SpotlightOverlay
          aboveNodes={spotlight.above}
          belowNodes={spotlight.below}
          projectNodeX={projectNodeX}
          leftBound={MARGIN.left}
          rightBound={MARGIN.left + innerW}
          nodeY={nodeY}
          nodeRadius={nodeRadius}
          heatTop={heatY0}
          chartHeight={size.h}
          onSelect={onSelect}
          motionKey={spotlightMotionKey}
        />
      </div>
      {hint && (
        <div className="timeline-hint timeline-hint--center">
          <strong>{hint.title}</strong>
          <span className="timeline-hint-time">{hint.time}</span>
        </div>
      )}
    </div>
  );
}
