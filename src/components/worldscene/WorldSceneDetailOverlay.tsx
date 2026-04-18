import { motion } from 'framer-motion';
import type { DestinationPoint } from '@/lib/worldsceneData';

interface Props {
  imageIndex: number;
  isFavorite: boolean;
  onEstimatePrice: () => void;
  onNextImage: () => void;
  onOpenLightbox: (image: string) => void;
  onPlanRoute: () => void;
  onPrevImage: () => void;
  onToggleFavorite: () => void;
  point: DestinationPoint;
}

export function WorldSceneDetailOverlay({
  imageIndex,
  isFavorite,
  onEstimatePrice,
  onNextImage,
  onOpenLightbox,
  onPlanRoute,
  onPrevImage,
  onToggleFavorite,
  point,
}: Props) {
  const hasImages = point.images.length > 0;
  const activeImage = hasImages ? point.images[imageIndex] : null;

  return (
    <motion.aside
      className="worldscene-detail-overlay"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="worldscene-detail-overlay__drag">当前景点</div>
      <div className="worldscene-detail-overlay__header">
        <div>
          <p className="worldscene-detail-overlay__eyebrow">
            {point.country} / {point.city}
          </p>
          <h3 className="worldscene-detail-overlay__title">{point.name}</h3>
        </div>
        <button type="button" className="worldscene-favorite-btn" onClick={onToggleFavorite}>
          {isFavorite ? '已收藏' : '收藏'}
        </button>
      </div>

      {hasImages ? (
        <>
          <div className="worldscene-detail-overlay__gallery">
            <button type="button" className="worldscene-gallery-nav" onClick={onPrevImage}>
              ‹
            </button>
            <button
              type="button"
              className="worldscene-detail-overlay__image-btn"
              onClick={() => activeImage && onOpenLightbox(activeImage)}
            >
              <img
                key={`${point.id}-${imageIndex}-${activeImage}`}
                src={activeImage ?? ''}
                alt={point.name}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
              />
            </button>
            <button type="button" className="worldscene-gallery-nav" onClick={onNextImage}>
              ›
            </button>
          </div>
          <p className="worldscene-gallery-count" aria-live="polite">
            配图 {imageIndex + 1} / {point.images.length}
          </p>
        </>
      ) : (
        <div className="worldscene-detail-overlay__gallery">
          <div className="worldscene-detail-overlay__image-btn" aria-live="polite">
            暂无合格配图
          </div>
        </div>
      )}

      <p className="worldscene-detail-overlay__tagline">{point.tagline}</p>
      <p className="worldscene-detail-overlay__desc">{point.description}</p>

      <div className="worldscene-overlay-meta">
        <span className="worldscene-meta-pill">等级 {point.grade}</span>
        <span className="worldscene-meta-pill">坐标 {point.lat.toFixed(2)}, {point.lng.toFixed(2)}</span>
        <span className="worldscene-meta-pill">推荐季节 {point.bestSeason}</span>
      </div>

      <div className="worldscene-chip-list">
        {point.tags.map((tag) => (
          <span key={tag} className="worldscene-chip">
            {tag}
          </span>
        ))}
      </div>

      <div className="worldscene-detail-actions">
        <button type="button" className="btn btn--primary" onClick={onPlanRoute}>
          规划路线
        </button>
        <button type="button" className="btn btn--secondary" onClick={onEstimatePrice}>
          估算费用
        </button>
      </div>
    </motion.aside>
  );
}
