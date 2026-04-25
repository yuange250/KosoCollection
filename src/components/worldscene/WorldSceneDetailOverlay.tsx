import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { DestinationPoint } from '@/lib/worldsceneData';
import { galleryPlaceholder } from '@/lib/worldscenePageUtils';

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
  const [brokenImages, setBrokenImages] = useState<string[]>([]);

  useEffect(() => {
    setBrokenImages([]);
  }, [point.id]);

  const images = Array.isArray(point.images)
    ? point.images.filter(
        (image): image is string =>
          typeof image === 'string' &&
          image.trim().length > 0 &&
          !brokenImages.includes(image),
      )
    : [];
  const tags = Array.isArray(point.tags)
    ? point.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const safeTagline =
    typeof point.tagline === 'string' && point.tagline.trim().length > 0
      ? point.tagline
      : '该景点的亮点信息正在整理中。';
  const safeDescription =
    typeof point.description === 'string' && point.description.trim().length > 0
      ? point.description
      : '该景点的详细介绍正在整理中。';
  const safeBestSeason =
    typeof point.bestSeason === 'string' && point.bestSeason.trim().length > 0
      ? point.bestSeason
      : '四季皆可';
  const safeLat = Number.isFinite(point.lat) ? point.lat.toFixed(2) : '--';
  const safeLng = Number.isFinite(point.lng) ? point.lng.toFixed(2) : '--';
  const safeImageIndex = images.length > 0 ? Math.min(imageIndex, images.length - 1) : 0;
  const fallbackImage = galleryPlaceholder(point.category);
  const hasImages = images.length > 0;
  const activeImage = hasImages ? images[safeImageIndex] : fallbackImage;

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
            {point.country || '未知地区'} / {point.city || '未知城市'}
          </p>
          <h3 className="worldscene-detail-overlay__title">
            {point.name || point.englishName || '未命名景点'}
          </h3>
        </div>
        <button type="button" className="worldscene-favorite-btn" onClick={onToggleFavorite}>
          {isFavorite ? '已收藏' : '收藏'}
        </button>
      </div>

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
            key={`${point.id}-${safeImageIndex}-${activeImage}`}
            src={activeImage}
            alt={point.name || point.englishName || '景点配图'}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => {
              if (activeImage && activeImage !== fallbackImage) {
                setBrokenImages((prev) =>
                  prev.includes(activeImage) ? prev : [...prev, activeImage],
                );
              }
            }}
          />
        </button>
        <button type="button" className="worldscene-gallery-nav" onClick={onNextImage}>
          ›
        </button>
      </div>
      <p className="worldscene-gallery-count" aria-live="polite">
        {hasImages ? `配图 ${safeImageIndex + 1} / ${images.length}` : '配图占位中'}
      </p>

      <p className="worldscene-detail-overlay__tagline">{safeTagline}</p>
      <p className="worldscene-detail-overlay__desc">{safeDescription}</p>

      <div className="worldscene-overlay-meta">
        <span className="worldscene-meta-pill">等级 {point.grade || '未分级'}</span>
        <span className="worldscene-meta-pill">坐标 {safeLat}, {safeLng}</span>
        <span className="worldscene-meta-pill">推荐季节 {safeBestSeason}</span>
      </div>

      <div className="worldscene-chip-list">
        {tags.map((tag) => (
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
