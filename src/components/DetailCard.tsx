import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { resolveSourceUrl } from '@/lib/sourceUrl';
import type { NodeDetails, TimelineNode } from '@/types/timeline';

function DetailsTable({ details, type }: { details: NodeDetails; type: string }) {
  const rows: [string, string | string[]][] = [];
  if (type === 'game') {
    if (details.developer) rows.push(['开发商', details.developer]);
    if (details.publisher) rows.push(['发行商', details.publisher]);
    if (details.sales) rows.push(['销量', details.sales]);
    if (details.easterEgg) rows.push(['彩蛋 / 幕后', details.easterEgg]);
  } else if (type === 'host') {
    if (details.parameters) rows.push(['硬件', details.parameters]);
    if (details.price) rows.push(['首发价', details.price]);
    if (details.lifeCycle) rows.push(['生命周期', details.lifeCycle]);
    if (details.exclusiveGames?.length)
      rows.push(['参考独占 / 代表游戏', details.exclusiveGames.join('、')]);
  } else {
    if (details.background) rows.push(['背景', details.background]);
    if (details.impact) rows.push(['产业影响', details.impact]);
    if (details.relatedContent?.length)
      rows.push(['相关内容', details.relatedContent.join('、')]);
  }
  if (!rows.length) return null;
  return (
    <table className="detail-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{Array.isArray(v) ? v.join('、') : v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Props {
  node: TimelineNode | null;
  all: Map<string, TimelineNode>;
  onClose: () => void;
  onGotoRelated: (id: string) => void;
}

export function DetailCard({ node, all, onClose, onGotoRelated }: Props) {
  const [imgOpen, setImgOpen] = useState(false);

  useEffect(() => {
    if (!node) setImgOpen(false);
  }, [node]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const related = node
    ? (node.relatedNodes.map((id) => all.get(id)).filter(Boolean) as TimelineNode[])
    : [];

  return (
    <AnimatePresence mode="wait">
      {node && (
        <motion.div
          key={node.id}
          className="modal-backdrop"
          role="dialog"
          aria-modal
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onMouseDown={onClose}
        >
          <motion.div
            className="modal-card"
            initial={{ scale: 0.94, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
            <div className="modal-grid">
              <div className="modal-visual">
                <button
                  type="button"
                  className="modal-img-btn"
                  onClick={() => setImgOpen(true)}
                >
                  <img src={node.content.imageUrl} alt="" loading="lazy" />
                </button>
                <a
                  className="modal-source"
                  href={resolveSourceUrl(node.content.sourceUrl, node.title)}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看来源网页 →
                </a>
              </div>
              <div className="modal-body">
                <p className="modal-meta">
                  <span className={`pill pill--${node.type}`}>
                    {node.type === 'game' ? '游戏' : node.type === 'host' ? '主机' : '事件'}
                  </span>
                  <span className="modal-time font-mono">{node.time}</span>
                </p>
                <h2 className="modal-title font-display">{node.title}</h2>
                <div className="modal-scroll">
                  <p className="modal-intro">{node.content.intro}</p>
                  <DetailsTable details={node.content.details} type={node.type} />
                  <p className="modal-tags">
                    {node.content.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </p>
                  {related.length > 0 && (
                    <div className="modal-related">
                      <h3>关联条目</h3>
                      <ul>
                        {related.map((r) => (
                          <li key={r.id}>
                            <button type="button" onClick={() => onGotoRelated(r.id)}>
                              {r.title} · {r.time}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
          {imgOpen && (
            <motion.button
              type="button"
              className="lightbox"
              aria-label="关闭大图"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setImgOpen(false)}
            >
              <img src={node.content.imageUrl} alt="" />
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
