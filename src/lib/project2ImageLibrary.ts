import { PROJECT2_POI_LOCAL } from './project2PoiCached.gen';
import { pickStockGalleryUrls, type StockKind } from './project2StockPhotos';

export type { StockKind } from './project2StockPhotos';

function imageSet(kind: StockKind) {
  const base = {
    heritage: '/placeholders/destination-heritage.svg',
    nature: '/placeholders/destination-nature.svg',
    city: '/placeholders/destination-city.svg',
    coast: '/placeholders/destination-coast.svg',
  }[kind];

  return [base, '/placeholders/work-global-atlas.svg', base] as const;
}

/**
 * 优先使用景点真实图；若缺失则回退到库存旅行图和站内占位，避免图库完全失效。
 */
export function buildProject2Gallery(pointId: string, kind: StockKind): string[] {
  const poiImages = PROJECT2_POI_LOCAL[pointId] ? [...PROJECT2_POI_LOCAL[pointId]] : [];
  const stockCount = poiImages.length >= 3 ? 1 : 3 - poiImages.length;
  const stocks = stockCount > 0 ? pickStockGalleryUrls(pointId, kind, stockCount) : [];
  const [base, atlas] = imageSet(kind);
  const crossKind: StockKind = kind === 'heritage' || kind === 'city' ? 'nature' : 'heritage';
  const [crossBase] = imageSet(crossKind);
  const sequence = [
    ...poiImages,
    ...stocks,
    atlas,
    base,
    crossBase,
    '/placeholders/event.svg',
    '/placeholders/timeline_banner.png',
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of sequence) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out.slice(0, 10);
}
