import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { BackToTop } from '@/components/BackToTop';
import { WorldSceneLightbox } from '@/components/worldscene/WorldSceneLightbox';
import { WorldSceneSidePanels } from '@/components/worldscene/WorldSceneSidePanels';
import { WorldSceneToolbar } from '@/components/worldscene/WorldSceneToolbar';
import { WorldSceneWorkspace } from '@/components/worldscene/WorldSceneWorkspace';
import { useWorldScene } from '@/hooks/useWorldScene';

export function WorldScene() {
  const {
    activeCategory,
    activeRegion,
    estimatePrice,
    favorites,
    hoverLatLng,
    hoverMarkerName,
    imageIndex,
    isFavorite,
    isTouchDevice,
    lightboxImage,
    originId,
    planRoute,
    priceBreakdown,
    query,
    resetSignal,
    rotationLocked,
    route,
    runSearch,
    searchHistory,
    searchMessage,
    searchResults,
    selectedPoint,
    setActiveCategory,
    setActiveRegion,
    setHoverLatLng,
    setHoverMarkerName,
    setImageIndex,
    setLightboxImage,
    setOriginId,
    setQuery,
    setResetSignal,
    setRotationLocked,
    setSelectedId,
    setTextureMode,
    setTravelMode,
    setZoomDistance,
    textureMode,
    toggleFavorite,
    travelMode,
    visiblePoints,
    zoomDistance,
  } = useWorldScene();

  return (
    <div className="layout">
      <motion.header
        className="nav nav--worldscene"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="nav-inner nav-inner--toolbar nav-inner--works">
          <Link to="/" className="nav-logo">
            <span className="nav-logo-mark">
              <span className="nav-logo-mark__inner">KS</span>
            </span>
            <span className="nav-logo-text">科索造物集</span>
          </Link>
          <nav className="nav-links">
            <Link to="/" className="nav-links__a">
              作品集
            </Link>
            <Link to="/guide" className="nav-links__a">
              使用指南
            </Link>
            <Link to="/feedback" className="nav-links__a">
              反馈建议
            </Link>
          </nav>
        </div>
      </motion.header>

      <motion.main
        className="worldscene"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <section className="worldscene-headline">
          <div>
            <p className="worldscene-eyebrow">蓝星之美</p>
            <h1 className="worldscene-headline__title">在地球上直接浏览、搜索并聚焦景点</h1>
          </div>
        </section>

        <WorldSceneToolbar
          onQueryChange={setQuery}
          onRunSearch={runSearch}
          onSelectExample={(value) => {
            setQuery(value);
            runSearch(value);
          }}
          onSelectResult={setSelectedId}
          query={query}
          searchMessage={searchMessage}
          searchResults={searchResults}
        />

        <section className="worldscene-section">
          <div className="worldscene-workspace">
            <div className="worldscene-main-column">
              <WorldSceneWorkspace
                activeCategory={activeCategory}
                activeRegion={activeRegion}
                hoverLatLng={hoverLatLng}
                hoverMarkerName={hoverMarkerName}
                imageIndex={imageIndex}
                isFavorite={isFavorite}
                isTouchDevice={isTouchDevice}
                onEstimatePrice={estimatePrice}
                onNextImage={() =>
                  setImageIndex((value) =>
                    selectedPoint ? (value === selectedPoint.images.length - 1 ? 0 : value + 1) : 0,
                  )
                }
                onOpenLightbox={setLightboxImage}
                onPlanRoute={planRoute}
                onPrevImage={() =>
                  setImageIndex((value) =>
                    selectedPoint ? (value === 0 ? selectedPoint.images.length - 1 : value - 1) : 0,
                  )
                }
                onResetCategory={setActiveCategory}
                onResetRegion={setActiveRegion}
                onResetView={() => setResetSignal((value) => value + 1)}
                onSelectPoint={setSelectedId}
                onSurfaceHover={setHoverLatLng}
                onToggleFavorite={toggleFavorite}
                onToggleMarkerHover={setHoverMarkerName}
                onToggleRotationLock={() => setRotationLocked((value) => !value)}
                onToggleTextureMode={() =>
                  setTextureMode((value) => (value === 'realistic' ? 'grid' : 'realistic'))
                }
                onZoomChange={setZoomDistance}
                resetSignal={resetSignal}
                rotationLocked={rotationLocked}
                route={route}
                selectedPoint={selectedPoint}
                textureMode={textureMode}
                visiblePoints={visiblePoints}
                zoomDistance={zoomDistance}
              />
            </div>

            <WorldSceneSidePanels
              favorites={favorites}
              onEstimatePrice={estimatePrice}
              onPlanRoute={planRoute}
              onRunSearch={runSearch}
              onSelectFavorite={setSelectedId}
              onSelectOrigin={setOriginId}
              onSelectSearchHistory={setQuery}
              onSelectTravelMode={setTravelMode}
              originId={originId}
              priceBreakdown={priceBreakdown}
              route={route}
              searchHistory={searchHistory}
              selectedPointName={selectedPoint?.name ?? null}
              travelMode={travelMode}
            />
          </div>
        </section>
      </motion.main>

      <footer className="footer">
        <p>科索造物集 · 蓝星之美 · 搜索、路线规划与预算估算</p>
      </footer>

      <WorldSceneLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      <BackToTop />
    </div>
  );
}
