import { motion } from 'framer-motion';
import { useMemo, useState, type CSSProperties } from 'react';
import { NavBar } from '@/components/NavBar';
import { Timeline } from '@/components/Timeline';
import { DetailCard } from '@/components/DetailCard';
import { BackToTop } from '@/components/BackToTop';
import { MilestoneRail } from '@/components/MilestoneRail';
import { useNodes } from '@/hooks/useNodes';
import {
  applyFilters,
  defaultFilters,
  searchNodes,
  type FilterState,
} from '@/lib/filters';
import type { TimelineNode } from '@/types/timeline';
import { timeToYearFraction } from '@/lib/time';
import { TIMELINE_SVG_HEIGHT } from '@/lib/timelineLayout';

export function Home() {
  const { nodes, status, error, reload } = useNodes();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [selected, setSelected] = useState<TimelineNode | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const displayed = useMemo(() => {
    const f = applyFilters(nodes, filters);
    return searchQ.trim() ? searchNodes(f, searchQ) : f;
  }, [nodes, filters, searchQ]);

  const searchResults = useMemo(() => {
    if (!searchQ.trim()) return [];
    const f = applyFilters(nodes, filters);
    const hits = searchNodes(f, searchQ);
    return [...hits].sort((a, b) => timeToYearFraction(a.time) - timeToYearFraction(b.time));
  }, [nodes, filters, searchQ]);

  const onSearchSubmit = () => {
    setSearchQ(searchInput.trim());
  };

  const goRelated = (id: string) => {
    const n = byId.get(id);
    if (n) {
      setSelected(n);
      setFocusId(id);
    }
  };

  return (
    <div className="layout">
      <NavBar
        search={searchInput}
        onSearch={setSearchInput}
        onSearchSubmit={onSearchSubmit}
        filters={filters}
        onFilters={setFilters}
        onResetFilters={() => setFilters(defaultFilters())}
        onClearSearch={() => {
          setSearchInput('');
          setSearchQ('');
        }}
      />

      <motion.main
        className="main"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        {status === 'loading' && (
          <div className="banner banner--loading">
            <span className="spinner" aria-hidden />
            正在加载时间轴数据…
          </div>
        )}
        {status === 'error' && (
          <div className="banner banner--error">
            <p>{error}</p>
            <button type="button" className="btn btn--primary" onClick={() => reload()}>
              重试
            </button>
          </div>
        )}

        {searchQ && (
          <div className="search-panel">
            <p className="search-panel-summary">
              {searchResults.length === 0 ? (
                <>未找到相关内容，请尝试其他关键词。</>
              ) : (
                <>
                  找到 <strong>{searchResults.length}</strong> 条结果（按关键词过滤，可在时间轴上查看分布）
                </>
              )}
            </p>
            {searchResults.length > 0 && (
              <ul className="search-panel-list">
                {searchResults.slice(0, 25).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="search-hit"
                      onClick={() => {
                        setSelected(n);
                        setFocusId(n.id);
                      }}
                    >
                      <span className={`pill pill--${n.type}`}>
                        {n.type === 'game' ? '游戏' : n.type === 'host' ? '主机' : '事件'}
                      </span>
                      <span className="search-hit-title">{n.title}</span>
                      <span className="search-hit-time">{n.time}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {status === 'ready' && displayed.length === 0 && (
          <div className="banner">当前筛选下无节点，请放宽筛选条件。</div>
        )}

        {status === 'ready' && displayed.length > 0 && (
          <div
            className="home-content-grid"
            style={
              {
                '--timeline-svg-height': `${TIMELINE_SVG_HEIGHT}px`,
              } as CSSProperties
            }
          >
            <MilestoneRail
              nodesById={byId}
              onPick={(n) => {
                setFilters(defaultFilters());
                setSearchInput('');
                setSearchQ('');
                setSelected(n);
                setFocusId(n.id);
              }}
            />
            <div className="home-timeline-col">
              <Timeline
                nodes={displayed}
                onSelect={setSelected}
                focusId={focusId}
                onFocusConsumed={() => setFocusId(null)}
              />
            </div>
          </div>
        )}
      </motion.main>

      <footer className="footer">
        <p>游戏史时间轴 · 公开数据仅供学习与交流 · 来源见各节点引用链接</p>
      </footer>

      <DetailCard
        node={selected}
        all={byId}
        onClose={() => setSelected(null)}
        onGotoRelated={goRelated}
      />
      <BackToTop />
    </div>
  );
}
