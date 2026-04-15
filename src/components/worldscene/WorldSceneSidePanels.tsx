import {
  DESTINATION_POINTS,
  ORIGIN_PRESETS,
  TRAVEL_MODE_OPTIONS,
  type TravelMode,
} from '@/lib/worldsceneData';
import { formatHours } from '@/lib/worldscenePageUtils';
import type { PriceBreakdown, RouteState } from '@/types/worldscene';

interface Props {
  favorites: string[];
  onEstimatePrice: () => void;
  onPlanRoute: () => void;
  onRunSearch: (value: string) => void;
  onSelectFavorite: (id: string) => void;
  onSelectOrigin: (id: string) => void;
  onSelectSearchHistory: (value: string) => void;
  onSelectTravelMode: (value: TravelMode) => void;
  originId: string;
  priceBreakdown: PriceBreakdown | null;
  route: RouteState | null;
  searchHistory: string[];
  selectedPointName: string | null;
  travelMode: TravelMode;
}

export function WorldSceneSidePanels({
  favorites,
  onEstimatePrice,
  onPlanRoute,
  onRunSearch,
  onSelectFavorite,
  onSelectOrigin,
  onSelectSearchHistory,
  onSelectTravelMode,
  originId,
  priceBreakdown,
  route,
  searchHistory,
  selectedPointName,
  travelMode,
}: Props) {
  return (
    <div className="worldscene-side-stack">
      <section className="worldscene-panel">
        <div className="worldscene-panel__head">
          <h3>路线规划</h3>
          <p>选择出发地与出行方式，快速估算距离和耗时。</p>
        </div>
        <div className="worldscene-form-grid">
          <label className="worldscene-field">
            <span>出发地</span>
            <select value={originId} onChange={(event) => onSelectOrigin(event.target.value)}>
              {ORIGIN_PRESETS.map((origin) => (
                <option key={origin.id} value={origin.id}>
                  {origin.city}
                </option>
              ))}
            </select>
          </label>
          <label className="worldscene-field">
            <span>出行方式</span>
            <select
              value={travelMode}
              onChange={(event) => onSelectTravelMode(event.target.value as TravelMode)}
            >
              {TRAVEL_MODE_OPTIONS.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn btn--primary worldscene-panel__action" onClick={onPlanRoute}>
          生成路线
        </button>

        {route && selectedPointName && (
          <div className="worldscene-panel__body">
            <div className="worldscene-stat-grid">
              <div>
                <span>预计距离</span>
                <strong>{Math.round(route.distanceKm).toLocaleString()} km</strong>
              </div>
              <div>
                <span>预计耗时</span>
                <strong>{formatHours(route.durationHours)}</strong>
              </div>
            </div>
            <ul className="worldscene-inline-list">
              {route.routeNodes.map((node) => (
                <li key={node}>{node}</li>
              ))}
            </ul>
            <p className="worldscene-helper-text">
              当前高亮路线已聚焦到 {selectedPointName}。
            </p>
          </div>
        )}
      </section>

      <section className="worldscene-panel">
        <div className="worldscene-panel__head">
          <h3>预算估算</h3>
          <p>综合交通、门票、住宿和餐饮，给出一个快速价格区间。</p>
        </div>
        <button type="button" className="btn btn--secondary worldscene-panel__action" onClick={onEstimatePrice}>
          估算费用
        </button>
        {priceBreakdown && (
          <div className="worldscene-panel__body">
            <div className="worldscene-price-hero">
              <strong>
                人均 {priceBreakdown.minTotal.toLocaleString()} - {priceBreakdown.maxTotal.toLocaleString()} 元
              </strong>
              <span>该价格仅作规划参考，不代表实时成交价。</span>
            </div>
            <div className="worldscene-stat-grid">
              <div>
                <span>交通</span>
                <strong>{priceBreakdown.transport.toLocaleString()} 元</strong>
              </div>
              <div>
                <span>门票</span>
                <strong>{priceBreakdown.ticket.toLocaleString()} 元</strong>
              </div>
              <div>
                <span>住宿</span>
                <strong>{priceBreakdown.lodging.toLocaleString()} 元</strong>
              </div>
              <div>
                <span>餐饮</span>
                <strong>{priceBreakdown.dining.toLocaleString()} 元</strong>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="worldscene-panel">
        <div className="worldscene-panel__head">
          <h3>收藏与历史</h3>
          <p>复用本地收藏和最近搜索，方便快速跳转。</p>
        </div>
        <div className="worldscene-chip-list">
          {favorites.length === 0 ? (
            <span className="worldscene-meta-pill">还没有收藏景点</span>
          ) : (
            favorites.map((id) => {
              const point = DESTINATION_POINTS.find((item) => item.id === id);
              if (!point) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className="worldscene-meta-chip"
                  onClick={() => onSelectFavorite(point.id)}
                >
                  {point.name}
                </button>
              );
            })
          )}
        </div>
        <div className="worldscene-chip-list">
          {searchHistory.length === 0 ? (
            <span className="worldscene-meta-pill">暂无最近搜索</span>
          ) : (
            searchHistory.map((item) => (
              <button
                key={item}
                type="button"
                className="worldscene-meta-chip"
                onClick={() => {
                  onSelectSearchHistory(item);
                  onRunSearch(item);
                }}
              >
                {item}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
