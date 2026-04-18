import { WORLDSCENE_POI_CATALOG } from './worldscenePoiCatalog.gen';
import { rankWorldScenePoiImages } from './worldscenePoiCatalog';
import { WORLDSCENE_POI_LOCAL } from './worldscenePoiCached.gen';
import type { StockKind } from './worldsceneStockPhotos';

// Only return curated POI photos. No stock or placeholder filling.
export function buildWorldSceneGallery(pointId: string, kind?: StockKind): string[] {
  void kind;

  const catalogImages = WORLDSCENE_POI_CATALOG[pointId]?.images ?? [];
  const prioritizedCatalogUrls = rankWorldScenePoiImages(catalogImages)
    .map((image) => image.url)
    .filter(Boolean);
  const legacyPoiImages = WORLDSCENE_POI_LOCAL[pointId] ? [...WORLDSCENE_POI_LOCAL[pointId]] : [];
  const poiImages = prioritizedCatalogUrls.length > 0 ? prioritizedCatalogUrls : legacyPoiImages;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of poiImages) {
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }

  return out;
}
