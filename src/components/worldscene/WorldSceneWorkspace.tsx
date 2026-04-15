import { Canvas } from '@react-three/fiber';
import {
  CATEGORY_OPTIONS,
  DESTINATION_POINTS,
  REGION_OPTIONS,
  type DestinationPoint,
} from '@/lib/worldsceneData';
import { formatLatLng } from '@/lib/worldscenePageUtils';
import type { RouteState } from '@/types/worldscene';
import { WorldSceneDetailOverlay } from '@/components/worldscene/WorldSceneDetailOverlay';
import { WorldSceneGlobeScene } from '@/components/worldscene/WorldSceneGlobeScene';

interface Props {
  activeCategory: (typeof CATEGORY_OPTIONS)[number];
  activeRegion: (typeof REGION_OPTIONS)[number];
  hoverLatLng: { lat: number; lng: number } | null;
  hoverMarkerName: string | null;
  imageIndex: number;
  isFavorite: boolean;
  isTouchDevice: boolean;
  onEstimatePrice: () => void;
  onNextImage: () => void;
  onOpenLightbox: (image: string) => void;
  onPlanRoute: () => void;
  onPrevImage: () => void;
  onResetCategory: (value: (typeof CATEGORY_OPTIONS)[number]) => void;
  onResetRegion: (value: (typeof REGION_OPTIONS)[number]) => void;
  onResetView: () => void;
  onSelectPoint: (id: string) => void;
  onSurfaceHover: (value: { lat: number; lng: number } | null) => void;
  onToggleFavorite: () => void;
  onToggleMarkerHover: (value: string | null) => void;
  onToggleRotationLock: () => void;
  onToggleTextureMode: () => void;
  onZoomChange: (value: number) => void;
  resetSignal: number;
  rotationLocked: boolean;
  route: RouteState | null;
  selectedPoint: DestinationPoint | null;
  textureMode: 'realistic' | 'grid';
  visiblePoints: readonly DestinationPoint[];
  zoomDistance: number;
}

export function WorldSceneWorkspace({
  activeCategory,
  activeRegion,
  hoverLatLng,
  hoverMarkerName,
  imageIndex,
  isFavorite,
  isTouchDevice,
  onEstimatePrice,
  onNextImage,
  onOpenLightbox,
  onPlanRoute,
  onPrevImage,
  onResetCategory,
  onResetRegion,
  onResetView,
  onSelectPoint,
  onSurfaceHover,
  onToggleFavorite,
  onToggleMarkerHover,
  onToggleRotationLock,
  onToggleTextureMode,
  onZoomChange,
  resetSignal,
  rotationLocked,
  route,
  selectedPoint,
  textureMode,
  visiblePoints,
  zoomDistance,
}: Props) {
  return (
    <>
      <div className="worldscene-scene-shell">
        <div className="worldscene-filter-bar worldscene-filter-bar--in-shell">
          <div className="worldscene-filter-group">
            <span className="worldscene-filter-group__label">地区</span>
            {REGION_OPTIONS.map((region) => (
              <button
                key={region}
                type="button"
                className={`worldscene-region-tab${region === activeRegion ? ' is-active' : ''}`}
                onClick={() => onResetRegion(region)}
              >
                {region}
              </button>
            ))}
          </div>
          <div className="worldscene-filter-group">
            <span className="worldscene-filter-group__label">类别</span>
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                className={`worldscene-region-tab${category === activeCategory ? ' is-active' : ''}`}
                onClick={() => onResetCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="worldscene-scene-head">
          <div className="worldscene-scene-head__lead">
            <span className="worldscene-scene-head__title">3D 地球工作台</span>
            <span className="worldscene-scene-head__count">
              当前显示 {visiblePoints.length} / 全库 {DESTINATION_POINTS.length}
            </span>
          </div>
          <div className="worldscene-scene-head__actions">
            <button type="button" className="btn btn--ghost btn--small" onClick={onResetView}>
              重置视角
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onToggleRotationLock}>
              {rotationLocked ? '解除旋转锁定' : '锁定旋转'}
            </button>
            <button type="button" className="btn btn--ghost btn--small" onClick={onToggleTextureMode}>
              {textureMode === 'realistic' ? '网格纹理' : '真实纹理'}
            </button>
          </div>
        </div>
        <div className="worldscene-scene-hints">
          <span className="worldscene-meta-pill">拖拽旋转</span>
          <span className="worldscene-meta-pill">滚轮或双指缩放</span>
          <span className="worldscene-meta-pill">
            {zoomDistance <= 2.96
              ? '当前已展开单个景点'
              : zoomDistance <= 4.45
                ? '当前为聚合层，继续拉近可展开'
                : '继续拉近以显示景点热点'}
          </span>
          <span className="worldscene-meta-pill">缩放 {zoomDistance.toFixed(2)}</span>
          <span className="worldscene-meta-pill">
            标记 {zoomDistance <= 3.12 ? '单点' : zoomDistance <= 4.25 ? '聚合' : '隐藏'}
          </span>
          {isTouchDevice && <span className="worldscene-meta-pill">单指旋转，双指缩放</span>}
          {hoverLatLng && (
            <span className="worldscene-meta-pill">
              经纬度 {hoverLatLng.lat.toFixed(2)}, {hoverLatLng.lng.toFixed(2)}
            </span>
          )}
          {hoverMarkerName && <span className="worldscene-meta-pill">悬浮 {hoverMarkerName}</span>}
        </div>
        <div className="worldscene-canvas-wrap">
          <Canvas
            style={{ width: '100%', height: '100%' }}
            camera={{ position: [0, 0, 3.56], fov: 34, near: 0.1, far: 120 }}
            dpr={[1, 1.6]}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <WorldSceneGlobeScene
              points={visiblePoints}
              selectedPoint={selectedPoint}
              route={route}
              rotationLocked={rotationLocked}
              zoomDistance={zoomDistance}
              textureMode={textureMode}
              resetSignal={resetSignal}
              onSelect={(point) => onSelectPoint(point.id)}
              onSurfaceHover={onSurfaceHover}
              onMarkerHover={onToggleMarkerHover}
              onZoomChange={onZoomChange}
            />
          </Canvas>
          <div className="worldscene-canvas-legend">
            <span><i className="worldscene-legend-dot worldscene-legend-dot--gold" /> 5A 景点</span>
            <span><i className="worldscene-legend-dot worldscene-legend-dot--cyan" /> 精选景点</span>
            <span><i className="worldscene-legend-dot worldscene-legend-dot--cluster" /> 聚合标记</span>
          </div>

          {selectedPoint && (
            <div className="worldscene-selection-hud">
              <span className="worldscene-selection-hud__label">当前景点</span>
              <strong>{selectedPoint.name}</strong>
              <p>
                {selectedPoint.country} / {selectedPoint.city} / {formatLatLng(selectedPoint.lat, selectedPoint.lng)}
              </p>
            </div>
          )}

          {selectedPoint && (
            <WorldSceneDetailOverlay
              point={selectedPoint}
              imageIndex={imageIndex}
              isFavorite={isFavorite}
              onEstimatePrice={onEstimatePrice}
              onNextImage={onNextImage}
              onOpenLightbox={onOpenLightbox}
              onPlanRoute={onPlanRoute}
              onPrevImage={onPrevImage}
              onToggleFavorite={onToggleFavorite}
            />
          )}
        </div>
      </div>
    </>
  );
}
