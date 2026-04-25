import { DESTINATION_POINTS, type DestinationPoint } from './worldsceneData';
import { galleryPlaceholder } from './worldscenePageUtils';

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function safeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function sanitizeDestinationPoint(point: DestinationPoint): DestinationPoint {
  const safeImages = safeStringArray(point.images).filter(
    (url) => /^https?:\/\//.test(url) || url.startsWith('/'),
  );

  return {
    ...point,
    id: safeText(point.id, `worldscene-${Math.random().toString(36).slice(2, 8)}`),
    name: safeText(point.name, safeText(point.englishName, '未命名景点')),
    englishName: safeText(point.englishName, safeText(point.name, 'Unknown destination')),
    aliases: safeStringArray(point.aliases),
    country: safeText(point.country, '未知地区'),
    city: safeText(point.city, '周边地区'),
    region: safeText(point.region, '其他'),
    category: safeText(point.category, '其他') as DestinationPoint['category'],
    grade: safeText(point.grade, '未分级') as DestinationPoint['grade'],
    lat: safeNumber(point.lat, 0),
    lng: safeNumber(point.lng, 0),
    tagline: safeText(point.tagline, '该景点的亮点信息正在整理中。'),
    description: safeText(point.description, '该景点的详细介绍正在整理中。'),
    bestSeason: safeText(point.bestSeason, '四季皆可'),
    tags: safeStringArray(point.tags),
    highlights: safeStringArray(point.highlights),
    images: safeImages.length > 0 ? safeImages : [galleryPlaceholder(point.category)],
    ticketCny: safeNumber(point.ticketCny, 0),
    stayCny: safeNumber(point.stayCny, 0),
    mealCny: safeNumber(point.mealCny, 0),
  };
}

export const SAFE_DESTINATION_POINTS: readonly DestinationPoint[] = DESTINATION_POINTS.map(
  sanitizeDestinationPoint,
);
