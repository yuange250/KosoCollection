export type WorldSceneSeasonKey = 'spring' | 'summer' | 'autumn' | 'winter' | 'all';

export interface WorldScenePoiImageMeta {
  url: string;
  source: string;
  title?: string;
  pageTitle?: string;
  capturedAt?: string;
  score?: number;
  width?: number;
  height?: number;
  monthHints?: readonly number[];
  seasonHints?: readonly WorldSceneSeasonKey[];
  keywords?: readonly string[];
}

export interface WorldScenePoiCatalogEntry {
  images: readonly WorldScenePoiImageMeta[];
}

function clampMonth(value: number) {
  return Math.min(12, Math.max(1, Math.round(value)));
}

function circularMonthDistance(a: number, b: number) {
  const delta = Math.abs(clampMonth(a) - clampMonth(b));
  return Math.min(delta, 12 - delta);
}

function parseCapturedMonth(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCMonth() + 1;
}

function scoreMonthHints(monthHints: readonly number[] | undefined, currentMonth: number) {
  if (!monthHints?.length) return 0;
  const distances = monthHints.map((month) => circularMonthDistance(month, currentMonth));
  const best = Math.min(...distances);
  return 120 - best * 28;
}

function scoreSeasonHints(seasonHints: readonly WorldSceneSeasonKey[] | undefined, currentMonth: number) {
  if (!seasonHints?.length) return 0;
  const bucket =
    currentMonth >= 3 && currentMonth <= 5
      ? 'spring'
      : currentMonth >= 6 && currentMonth <= 8
        ? 'summer'
        : currentMonth >= 9 && currentMonth <= 11
          ? 'autumn'
          : 'winter';
  if (seasonHints.includes('all') || seasonHints.includes(bucket)) return 48;
  return 0;
}

function scoreCapturedAt(capturedAt: string | undefined, currentMonth: number) {
  const capturedMonth = parseCapturedMonth(capturedAt);
  if (!capturedMonth) return 0;
  return 34 - circularMonthDistance(capturedMonth, currentMonth) * 6;
}

export function rankWorldScenePoiImages(
  images: readonly WorldScenePoiImageMeta[],
  now = new Date(),
) {
  const currentMonth = now.getMonth() + 1;

  return [...images].sort((left, right) => {
    const leftScore =
      (left.score ?? 0) +
      scoreMonthHints(left.monthHints, currentMonth) +
      scoreSeasonHints(left.seasonHints, currentMonth) +
      scoreCapturedAt(left.capturedAt, currentMonth);
    const rightScore =
      (right.score ?? 0) +
      scoreMonthHints(right.monthHints, currentMonth) +
      scoreSeasonHints(right.seasonHints, currentMonth) +
      scoreCapturedAt(right.capturedAt, currentMonth);

    if (rightScore !== leftScore) return rightScore - leftScore;
    return (right.score ?? 0) - (left.score ?? 0);
  });
}
