import * as THREE from 'three';
import type { DestinationPoint } from '@/lib/worldsceneData';

export function galleryPlaceholder(category: DestinationPoint['category']): string {
  switch (category) {
    case '自然景观':
      return '/placeholders/destination-nature.svg';
    case '人文古迹':
      return '/placeholders/destination-heritage.svg';
    case '城市地标':
      return '/placeholders/destination-city.svg';
    case '海岛度假':
      return '/placeholders/destination-coast.svg';
    default:
      return '/placeholders/work-global-atlas.svg';
  }
}

export function formatHours(hours: number) {
  if (!Number.isFinite(hours)) return '--';
  if (hours < 1) return `${Math.round(hours * 60)} 分钟`;
  if (hours < 24) return `${hours.toFixed(1)} 小时`;
  return `${(hours / 24).toFixed(1)} 天`;
}

export function formatLatLng(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '-- / --';
  const latLabel = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lngLabel = `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
  return `${latLabel} / ${lngLabel}`;
}

export function pointPriority(point: DestinationPoint) {
  let score = 0;
  if (point.grade === '5A') score += 3;
  else if (point.ticketCny >= 0) score += 2;
  else score += 1;

  if (point.ticketCny >= 180) score += 1;
  if (point.tags.length >= 3) score += 1;
  return score;
}

export function visiblePointLimitByZoom(zoomDistance: number) {
  if (zoomDistance <= 1.8) return Number.POSITIVE_INFINITY;

  const farZoom = 4.8;
  const nearZoom = 2.1;
  const t = THREE.MathUtils.clamp((farZoom - zoomDistance) / (farZoom - nearZoom), 0, 1);
  const eased = THREE.MathUtils.smootherstep(t, 0, 1);
  return Math.round(THREE.MathUtils.lerp(22, 138, eased));
}

export function visibleTierRatiosByZoom(zoomDistance: number) {
  const majorT = THREE.MathUtils.smootherstep(
    THREE.MathUtils.clamp((4.6 - zoomDistance) / (4.6 - 2.4), 0, 1),
    0,
    1,
  );
  const standardT = THREE.MathUtils.smootherstep(
    THREE.MathUtils.clamp((3.25 - zoomDistance) / (3.25 - 1.85), 0, 1),
    0,
    1,
  );

  const majorRatio = THREE.MathUtils.lerp(0.18, 0.36, majorT);
  const standardRatio = THREE.MathUtils.lerp(0, 0.34, standardT);
  const iconicRatio = Math.max(0.22, 1 - majorRatio - standardRatio);

  return {
    iconic: iconicRatio,
    major: majorRatio,
    standard: standardRatio,
  };
}
