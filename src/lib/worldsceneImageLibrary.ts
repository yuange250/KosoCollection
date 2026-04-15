import { WORLDSCENE_POI_CATALOG } from './worldscenePoiCatalog.gen';
import { rankWorldScenePoiImages } from './worldscenePoiCatalog';
import { PROJECT2_POI_LOCAL } from './worldscenePoiCached.gen';
import { pickStockGalleryUrls, type StockKind } from './worldsceneStockPhotos';

export type { StockKind } from './worldsceneStockPhotos';

function imageSet(kind: StockKind) {
  const base = {
    heritage: '/placeholders/destination-heritage.svg',
    nature: '/placeholders/destination-nature.svg',
    city: '/placeholders/destination-city.svg',
    coast: '/placeholders/destination-coast.svg',
  }[kind];

  return [base, '/placeholders/work-global-atlas.svg', base] as const;
}

// 优先使用景点真实图，缺失时再回退到图库与站内占位图。
export function buildWorldSceneGallery(pointId: string, kind: StockKind): string[] {
  const catalogImages = WORLDSCENE_POI_CATALOG[pointId]?.images ?? [];
  const prioritizedCatalogUrls = rankWorldScenePoiImages(catalogImages)
    .map((image) => image.url)
    .filter(Boolean);
  const legacyPoiImages = PROJECT2_POI_LOCAL[pointId] ? [...PROJECT2_POI_LOCAL[pointId]] : [];
  const poiImages = prioritizedCatalogUrls.length > 0 ? prioritizedCatalogUrls : legacyPoiImages;
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