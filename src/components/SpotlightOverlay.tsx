import { motion } from 'framer-motion';
import type { TimelineNode } from '@/types/timeline';

interface Props {
  aboveNodes: TimelineNode[];
  belowNodes: TimelineNode[];
  projectNodeX: (n: TimelineNode) => number;
  leftBound: number;
  rightBound: number;
  nodeY: number;
  nodeRadius: number;
  heatTop: number;
  chartHeight: number;
  onSelect: (n: TimelineNode) => void;
  motionKey: string;
}

const CARD_GAP_Y = 22;
const CARD_H = 72;
const LANE_PITCH = 84;
const MAX_LANES = 3;
const CARD_W = 184;
const CARD_COLLISION_PAD = 18;
const EDGE_PAD_TOP = 16;
const EDGE_PAD_BOTTOM = 12;

type Positioned = {
  n: TimelineNode;
  anchorX: number;
  lane: number;
};

type Rendered = Positioned & {
  side: 'above' | 'below';
  cardTop: number;
  cardX: number;
  delay: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function placeCardX(anchorX: number, lane: number, minX: number, maxX: number): number {
  const edgeBias = CARD_W * 0.62;
  if (anchorX > maxX - edgeBias) {
    return clamp(anchorX - CARD_W * 0.34 - lane * 8, minX, maxX);
  }
  if (anchorX < minX + edgeBias) {
    return clamp(anchorX + CARD_W * 0.34 + lane * 8, minX, maxX);
  }
  if (lane === 0) {
    return clamp(anchorX, minX, maxX);
  }
  const slot = Math.floor(anchorX / Math.max(CARD_W * 0.72, 1));
  const dir = (slot + lane) % 2 === 0 ? -1 : 1;
  const offset = dir * (CARD_W * 0.24 + Math.min(18, lane * 6));
  return clamp(anchorX + offset, minX, maxX);
}

function chooseLane(anchorX: number, laneRightEdge: number[], maxLane: number): { lane: number; fit: boolean } {
  const gap = CARD_W + CARD_COLLISION_PAD;
  for (let i = 0; i < maxLane; i++) {
    if (anchorX - laneRightEdge[i] >= gap) return { lane: i, fit: true };
  }
  let lane = 0;
  for (let i = 1; i < maxLane; i++) {
    if (laneRightEdge[i] < laneRightEdge[lane]) lane = i;
  }
  return { lane, fit: false };
}

function dedupeNodes(nodes: TimelineNode[]): TimelineNode[] {
  const seen = new Set<string>();
  const out: TimelineNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

function layoutAdaptive(
  nodes: TimelineNode[],
  projectNodeX: (n: TimelineNode) => number,
  maxAboveLanes: number,
  maxBelowLanes: number,
): { above: Positioned[]; below: Positioned[] } {
  const sorted = dedupeNodes(nodes)
    .map((n) => ({ n, anchorX: projectNodeX(n) }))
    .sort((a, b) => a.anchorX - b.anchorX);

  const aboveEdges = new Array<number>(maxAboveLanes).fill(-Infinity);
  const belowEdges = new Array<number>(maxBelowLanes).fill(-Infinity);
  const above: Positioned[] = [];
  const below: Positioned[] = [];

  for (const item of sorted) {
    const a = chooseLane(item.anchorX, aboveEdges, maxAboveLanes);
    const b = chooseLane(item.anchorX, belowEdges, maxBelowLanes);

    const aboveCount = above.length;
    const belowCount = below.length;
    const countBiasA = Math.max(0, aboveCount - belowCount) * 0.25;
    const countBiasB = Math.max(0, belowCount - aboveCount) * 0.25;
    const costA = a.lane * 1.15 + (a.fit ? 0 : 1.25) + countBiasA;
    const costB = b.lane * 1.15 + (b.fit ? 0 : 1.25) + countBiasB;

    if (costA <= costB) {
      aboveEdges[a.lane] = item.anchorX;
      above.push({ ...item, lane: a.lane });
    } else {
      belowEdges[b.lane] = item.anchorX;
      below.push({ ...item, lane: b.lane });
    }
  }

  return { above, below };
}

export function SpotlightOverlay({
  aboveNodes,
  belowNodes,
  projectNodeX,
  leftBound,
  rightBound,
  nodeY,
  nodeRadius,
  heatTop: _heatTop,
  chartHeight,
  onSelect,
  motionKey,
}: Props) {
  if (!aboveNodes.length && !belowNodes.length) return null;

  const aboveBaseY = nodeY - CARD_GAP_Y - nodeRadius - CARD_H;
  const belowBaseY = nodeY + CARD_GAP_Y + nodeRadius;
  const maxAboveLanes = Math.max(
    1,
    Math.min(MAX_LANES, Math.floor((aboveBaseY - EDGE_PAD_TOP) / LANE_PITCH) + 1),
  );
  const maxBelowLanes = Math.max(
    1,
    Math.min(MAX_LANES, Math.floor((chartHeight - EDGE_PAD_BOTTOM - CARD_H - belowBaseY) / LANE_PITCH) + 1),
  );

  const adaptive = layoutAdaptive([...aboveNodes, ...belowNodes], projectNodeX, maxAboveLanes, maxBelowLanes);
  const above = adaptive.above;
  const below = adaptive.below;
  const laneCounters = new Array<number>(MAX_LANES).fill(0);
  const minX = leftBound + CARD_W / 2 + 6;
  const maxX = rightBound - CARD_W / 2 - 6;
  const minTop = EDGE_PAD_TOP;
  const maxBelowTop = chartHeight - CARD_H - EDGE_PAD_BOTTOM;

  const aboveRender: Rendered[] = above.map((item) => {
    const rawTop = nodeY - CARD_GAP_Y - nodeRadius - CARD_H - item.lane * LANE_PITCH;
    const cardTop = Math.max(minTop, rawTop);
    const slot = laneCounters[item.lane]++;
    const delay = item.lane * 0.06 + slot * 0.016;
    const cardX = placeCardX(item.anchorX, item.lane, minX, maxX);
    return { ...item, side: 'above', cardTop, cardX, delay };
  });
  laneCounters.fill(0);
  const belowRender: Rendered[] = below.map((item) => {
    const rawTop = nodeY + CARD_GAP_Y + nodeRadius + item.lane * LANE_PITCH;
    const cardTop = Math.min(maxBelowTop, rawTop);
    const slot = laneCounters[item.lane]++;
    const delay = item.lane * 0.06 + slot * 0.016;
    const cardX = placeCardX(item.anchorX, item.lane, minX, maxX);
    return { ...item, side: 'below', cardTop, cardX, delay };
  });

  const all = [...aboveRender, ...belowRender];

  const linkPath = (it: Rendered): string => {
    const yNode = it.side === 'above' ? nodeY - nodeRadius : nodeY + nodeRadius;
    const yCard = it.side === 'above' ? it.cardTop + CARD_H : it.cardTop;
    const sideDx = (it.cardX - it.anchorX) * 0.45;
    const jitterDx = (it.n.id.charCodeAt(0) % 2 === 0 ? 1 : -1) * (4 + it.lane * 3);
    const dx = sideDx + jitterDx;
    const mid = (yNode + yCard) / 2;
    return `M ${it.anchorX} ${yNode} C ${it.anchorX + dx} ${mid}, ${it.cardX + dx * 0.25} ${mid}, ${it.cardX} ${yCard}`;
  };

  return (
    <div className="timeline-spotlight-overlay" style={{ height: chartHeight }}>
      <svg className="timeline-spotlight-links" width="100%" height={chartHeight} aria-hidden>
        {all.map((it) => (
          <path
            key={`${motionKey}-link-${it.side}-${it.n.id}`}
            className="spotlight-link-path"
            d={linkPath(it)}
          />
        ))}
      </svg>

      {aboveRender.map(({ n, cardX, lane, cardTop, delay }) => {
        return (
        <motion.button
          type="button"
          key={`${motionKey}-above-${n.id}`}
          className={`spotlight-card spotlight-card--above spotlight-card--lane-${lane}`}
          style={{ left: cardX, top: cardTop }}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => onSelect(n)}
        >
          <div className="spotlight-card__thumb">
            <img src={n.content.imageUrl} alt="" loading="lazy" />
          </div>
          <div className="spotlight-card__body">
            <span className="spotlight-card__title">{n.title}</span>
            <span className="spotlight-card__meta">{n.time}</span>
          </div>
        </motion.button>
      );
      })}

      {belowRender.map(({ n, cardX, lane, cardTop, delay }) => {
        return (
        <motion.button
          type="button"
          key={`${motionKey}-below-${n.id}`}
          className={`spotlight-card spotlight-card--below spotlight-card--lane-${lane}`}
          style={{ left: cardX, top: cardTop }}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => onSelect(n)}
        >
          <div className="spotlight-card__thumb">
            <img src={n.content.imageUrl} alt="" loading="lazy" />
          </div>
          <div className="spotlight-card__body">
            <span className="spotlight-card__title">{n.title}</span>
            <span className="spotlight-card__meta">{n.time}</span>
          </div>
        </motion.button>
      );
      })}
    </div>
  );
}
