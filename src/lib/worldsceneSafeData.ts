import {
  CATEGORY_OPTIONS,
  DESTINATION_POINTS,
  REGION_OPTIONS,
  type DestinationPoint,
} from './worldsceneData';
import { galleryPlaceholder } from './worldscenePageUtils';

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const next = item.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stableFallbackId(point: DestinationPoint) {
  const seed = safeText(point.englishName, safeText(point.name, 'worldscene-destination'));
  const slug = seed
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  return slug ? `worldscene-${slug}` : 'worldscene-destination';
}

function safeLat(value: unknown) {
  const next = safeNumber(value, 0);
  return Math.min(90, Math.max(-90, next));
}

function safeLng(value: unknown) {
  const next = safeNumber(value, 0);
  return ((((next + 180) % 360) + 360) % 360) - 180;
}

function coerceOption<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
) {
  const text = safeText(value, '');
  return options.includes(text) ? (text as T[number]) : fallback;
}

function coerceGrade(value: unknown): DestinationPoint['grade'] {
  const text = safeText(value, '');
  if (/5a/i.test(text)) return '5A' as DestinationPoint['grade'];
  return (text || '精品') as DestinationPoint['grade'];
}

const destinationCategoryOptions = CATEGORY_OPTIONS.filter(
  (_item, index): _item is DestinationPoint['category'] => index > 0,
);
const categoryFallback = destinationCategoryOptions[0];
const regionFallback = REGION_OPTIONS[1] ?? REGION_OPTIONS[0];

export function sanitizeDestinationPoint(point: DestinationPoint): DestinationPoint {
  const category = coerceOption(point.category, destinationCategoryOptions, categoryFallback);
  const safeImages = safeStringArray(point.images).filter(
    (url) => /^https?:\/\//.test(url) || url.startsWith('/'),
  );

  return {
    ...point,
    id: safeText(point.id, stableFallbackId(point)),
    name: safeText(point.name, safeText(point.englishName, 'Unknown destination')),
    englishName: safeText(point.englishName, safeText(point.name, 'Unknown destination')),
    aliases: safeStringArray(point.aliases),
    country: safeText(point.country, 'Unknown region'),
    city: safeText(point.city, 'Nearby area'),
    region: coerceOption(point.region, REGION_OPTIONS, regionFallback),
    category,
    grade: coerceGrade(point.grade),
    lat: safeLat(point.lat),
    lng: safeLng(point.lng),
    tagline: safeText(point.tagline, 'Highlights are being curated.'),
    description: safeText(point.description, 'Detailed notes are being curated.'),
    bestSeason: safeText(point.bestSeason, 'All year'),
    tags: safeStringArray(point.tags),
    highlights: safeStringArray(point.highlights),
    images: safeImages.length > 0 ? safeImages : [galleryPlaceholder(category)],
    ticketCny: Math.max(0, Math.round(safeNumber(point.ticketCny, 0))),
    stayCny: Math.max(0, Math.round(safeNumber(point.stayCny, 0))),
    mealCny: Math.max(0, Math.round(safeNumber(point.mealCny, 0))),
  };
}

export const SAFE_DESTINATION_POINTS: readonly DestinationPoint[] = (() => {
  const seen = new Set<string>();
  const out: DestinationPoint[] = [];

  for (const point of DESTINATION_POINTS) {
    const sanitized = sanitizeDestinationPoint(point);
    if (seen.has(sanitized.id)) continue;
    seen.add(sanitized.id);
    out.push(sanitized);
  }

  return out;
})();
