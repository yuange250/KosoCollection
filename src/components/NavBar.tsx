import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FILTER_GENRES,
  FILTER_PLATFORMS,
  FILTER_REGIONS,
  FILTER_VENDORS,
  type FilterState,
} from '@/lib/filters';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  onSearchSubmit: () => void;
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  onResetFilters: () => void;
  onClearSearch: () => void;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <details className="filter-details">
      <summary>{label}</summary>
      <div className="filter-chips">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              className={on ? 'chip chip--on' : 'chip'}
              onClick={() =>
                onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function NavBar({
  search,
  onSearch,
  onSearchSubmit,
  filters,
  onFilters,
  onResetFilters,
  onClearSearch,
}: Props) {
  const types = filters.contentTypes;

  const toggleType = (t: 'game' | 'host' | 'event') => {
    const on = types.includes(t);
    onFilters({
      ...filters,
      contentTypes: on ? types.filter((x) => x !== t) : [...types, t],
    });
  };

  return (
    <motion.header
      className="nav"
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="nav-inner">
        <Link to="/" className="nav-logo">
          <span className="nav-logo-mark">
            <span className="nav-logo-mark__inner">KS</span>
          </span>
          <span className="nav-logo-text">科索造物集</span>
        </Link>
        <div className="nav-search">
          <input
            type="search"
            placeholder="搜索游戏、主机、年份或事件…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit()}
          />
          <button type="button" className="btn btn--primary nav-search-btn" onClick={onSearchSubmit}>
            搜索
          </button>
        </div>
        <nav className="nav-links">
          <Link to="/guide" className="nav-links__a">
            使用指南
          </Link>
          <Link to="/about" className="nav-links__a">
            关于我们
          </Link>
          <Link to="/feedback" className="nav-links__a">
            反馈建议
          </Link>
        </nav>
      </div>
      <div className="nav-filters">
        <div className="nav-filters-row">
          <span className="nav-filters-label">筛选</span>
          <MultiSelect
            label="平台"
            options={FILTER_PLATFORMS}
            selected={filters.platforms}
            onChange={(platforms) => onFilters({ ...filters, platforms })}
          />
          <MultiSelect
            label="类型"
            options={FILTER_GENRES}
            selected={filters.genres}
            onChange={(genres) => onFilters({ ...filters, genres })}
          />
          <MultiSelect
            label="地区"
            options={FILTER_REGIONS}
            selected={filters.regions}
            onChange={(regions) => onFilters({ ...filters, regions })}
          />
          <MultiSelect
            label="厂商"
            options={FILTER_VENDORS}
            selected={filters.vendors}
            onChange={(vendors) => onFilters({ ...filters, vendors })}
          />
          <div className="filter-details filter-details--inline">
            <span className="nav-filters-label">内容</span>
            {(['game', 'host', 'event'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={types.includes(t) ? 'chip chip--on' : 'chip'}
                onClick={() => toggleType(t)}
              >
                {t === 'game' ? '游戏' : t === 'host' ? '主机' : '事件'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={onResetFilters}>
            清除筛选
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClearSearch}>
            清除搜索
          </button>
        </div>
      </div>
    </motion.header>
  );
}
