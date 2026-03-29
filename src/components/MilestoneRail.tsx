import { motion } from 'framer-motion';
import type { TimelineNode } from '@/types/timeline';

/** 首屏左侧速览：偏早期史 + 各代代表，缓解全局视图左侧偏空 */
const RAIL_IDS: readonly string[] = [
  'tennis-for-two',
  'pong',
  'magnavox-odyssey',
  'nes-jp',
  'ps1-launch',
  'ff7',
  'wow-launch',
  'switch-2017',
];

interface Props {
  nodesById: Map<string, TimelineNode>;
  onPick: (n: TimelineNode) => void;
}

export function MilestoneRail({ nodesById, onPick }: Props) {
  const items = RAIL_IDS.map((id) => nodesById.get(id)).filter(Boolean) as TimelineNode[];

  if (!items.length) return null;

  return (
    <>
      <aside
        className="milestone-rail"
        aria-label="里程碑速览"
        title="悬停或按 Tab 聚焦以展开"
      >
        <div className="milestone-rail__spine" aria-hidden="true">
          <span className="milestone-rail__spine-text">里程碑</span>
        </div>
        <div className="milestone-rail__drawer">
          <h2 className="milestone-rail__title">里程碑速览</h2>
          <p className="milestone-rail__hint">点击可定位到时间轴条目</p>
          <ul className="milestone-rail__list">
            {items.map((n, i) => (
              <motion.li
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <button type="button" className="milestone-rail__btn" onClick={() => onPick(n)}>
                  <span className="milestone-rail__thumb">
                    <img src={n.content.imageUrl} alt="" loading="lazy" />
                  </span>
                  <span className="milestone-rail__body">
                    <span className={`milestone-rail__pill milestone-rail__pill--${n.type}`}>
                      {n.type === 'game' ? '游戏' : n.type === 'host' ? '主机' : '事件'}
                    </span>
                    <span className="milestone-rail__name">{n.title}</span>
                    <span className="milestone-rail__time font-mono">{n.time}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </aside>

      <details className="milestone-rail-mobile">
        <summary className="milestone-rail-mobile__summary">里程碑速览（点击展开）</summary>
        <div className="milestone-rail-mobile__body">
          <ul className="milestone-rail__list">
            {items.map((n, i) => (
              <motion.li
                key={`mobile-${n.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <button type="button" className="milestone-rail__btn" onClick={() => onPick(n)}>
                  <span className="milestone-rail__thumb">
                    <img src={n.content.imageUrl} alt="" loading="lazy" />
                  </span>
                  <span className="milestone-rail__body">
                    <span className={`milestone-rail__pill milestone-rail__pill--${n.type}`}>
                      {n.type === 'game' ? '游戏' : n.type === 'host' ? '主机' : '事件'}
                    </span>
                    <span className="milestone-rail__name">{n.title}</span>
                    <span className="milestone-rail__time font-mono">{n.time}</span>
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </div>
      </details>
    </>
  );
}
