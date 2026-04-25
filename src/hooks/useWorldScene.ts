import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORY_OPTIONS,
  ORIGIN_PRESETS,
  REGION_OPTIONS,
  SEARCH_EXAMPLES,
  type DestinationPoint,
  type TravelMode,
} from '@/lib/worldsceneData';
import { SAFE_DESTINATION_POINTS } from '@/lib/worldsceneSafeData';
import {
  getWorldSceneDisplayTier,
  visibleTiersByZoom,
} from '@/lib/worldsceneDisplayMeta';
import {
  estimateRoute,
  estimateTripCost,
  searchDestinations,
} from '@/lib/worldsceneUtils';
import {
  pointPriority,
  visiblePointLimitByZoom,
  visibleTierRatiosByZoom,
} from '@/lib/worldscenePageUtils';
import type { PriceBreakdown, RouteState } from '@/types/worldscene';

export function useWorldScene() {
  const [activeRegion, setActiveRegion] = useState<(typeof REGION_OPTIONS)[number]>('全部');
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>('全部');
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ point: DestinationPoint; score: number }>>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [hoverLatLng, setHoverLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [hoverMarkerName, setHoverMarkerName] = useState<string | null>(null);
  const [rotationLocked, setRotationLocked] = useState(false);
  const [textureMode, setTextureMode] = useState<'realistic' | 'grid'>('realistic');
  const [resetSignal, setResetSignal] = useState(0);
  const [zoomDistance, setZoomDistance] = useState(3.38);
  const [originId, setOriginId] = useState(ORIGIN_PRESETS[0]?.id ?? '');
  const [travelMode, setTravelMode] = useState<TravelMode>('drive');
  const [route, setRoute] = useState<RouteState | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFavorites(JSON.parse(window.localStorage.getItem('worldscene-favorites') ?? '[]'));
    setSearchHistory(JSON.parse(window.localStorage.getItem('worldscene-search-history') ?? '[]'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('worldscene-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('worldscene-search-history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const visiblePoints = useMemo(() => {
    const filtered = SAFE_DESTINATION_POINTS.filter((point) => {
      const regionMatch = activeRegion === '全部' || point.region === activeRegion;
      const categoryMatch = activeCategory === '全部' || point.category === activeCategory;
      return regionMatch && categoryMatch;
    });

    const limit = visiblePointLimitByZoom(zoomDistance);
    const sorted = [...filtered].sort((left, right) => {
      const priorityDelta = pointPriority(right) - pointPriority(left);
      if (priorityDelta !== 0) return priorityDelta;
      return left.name.localeCompare(right.name);
    });

    if (!Number.isFinite(limit)) return sorted;

    const fallbackAllowedTiers = visibleTiersByZoom(zoomDistance);
    const buckets = {
      iconic: sorted.filter((point) => getWorldSceneDisplayTier(point) === 'iconic'),
      major: sorted.filter((point) => getWorldSceneDisplayTier(point) === 'major'),
      standard: sorted.filter((point) => getWorldSceneDisplayTier(point) === 'standard'),
    };

    const ratios = visibleTierRatiosByZoom(zoomDistance);
    const iconicTarget = Math.min(
      buckets.iconic.length,
      Math.max(1, Math.round(limit * ratios.iconic)),
    );
    const majorTarget = fallbackAllowedTiers.has('major')
      ? Math.min(buckets.major.length, Math.round(limit * ratios.major))
      : 0;
    const standardTarget = fallbackAllowedTiers.has('standard')
      ? Math.min(buckets.standard.length, Math.round(limit * ratios.standard))
      : 0;

    const picked = [
      ...buckets.iconic.slice(0, iconicTarget),
      ...buckets.major.slice(0, majorTarget),
      ...buckets.standard.slice(0, standardTarget),
    ];

    const used = new Set(picked.map((point) => point.id));
    if (picked.length < limit) {
      for (const point of sorted) {
        if (used.has(point.id)) continue;
        picked.push(point);
        used.add(point.id);
        if (picked.length >= limit) break;
      }
    }

    const limited = picked.slice(0, limit);
    if (!selectedId) return limited;

    const selectedPoint = SAFE_DESTINATION_POINTS.find((point) => point.id === selectedId);
    if (!selectedPoint) return limited;
    if (!filtered.some((point) => point.id === selectedId)) return limited;
    if (limited.some((point) => point.id === selectedId)) return limited;

    return [selectedPoint, ...limited.slice(0, Math.max(0, limit - 1))];
  }, [activeCategory, activeRegion, selectedId, zoomDistance]);

  useEffect(() => {
    if (visiblePoints.length === 0) {
      setSelectedId('');
      return;
    }
    if (selectedId && !SAFE_DESTINATION_POINTS.some((point) => point.id === selectedId)) {
      setSelectedId('');
    }
  }, [selectedId, visiblePoints]);

  const selectedPoint = useMemo(
    () => SAFE_DESTINATION_POINTS.find((point) => point.id === selectedId) ?? null,
    [selectedId],
  );

  const selectedOrigin = useMemo(
    () => ORIGIN_PRESETS.find((origin) => origin.id === originId) ?? ORIGIN_PRESETS[0],
    [originId],
  );

  useEffect(() => {
    const imageCount = Array.isArray(selectedPoint?.images) ? selectedPoint.images.length : 0;
    if (imageCount <= 0) {
      if (imageIndex !== 0) setImageIndex(0);
      return;
    }
    if (imageIndex >= imageCount) {
      setImageIndex(0);
    }
  }, [imageIndex, selectedPoint]);

  const isFavorite = selectedPoint ? favorites.includes(selectedPoint.id) : false;

  const runSearch = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchMessage('');
      return;
    }

    const matches = searchDestinations(trimmed, SAFE_DESTINATION_POINTS, 3);
    if (matches.length === 0) {
      setSearchResults([]);
      setSearchMessage(`没有匹配到景点，请尝试更具体的描述，例如：${SEARCH_EXAMPLES.join(' / ')}`);
      return;
    }

    setSearchResults(matches);
    setSearchMessage(`已匹配到 ${matches.length} 个结果，并自动聚焦到最接近的景点。`);
    setActiveRegion('全部');
    setActiveCategory('全部');
    setSelectedId(matches[0].point.id);
    setSearchHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 6));
  };

  const planRoute = () => {
    if (!selectedPoint || !selectedOrigin) return;
    const estimated = estimateRoute(selectedOrigin, selectedPoint, travelMode);
    setRoute({ origin: selectedOrigin, mode: travelMode, ...estimated });
    setPriceBreakdown(null);
  };

  const estimatePrice = () => {
    if (!selectedPoint || !selectedOrigin) return;
    setPriceBreakdown(estimateTripCost(selectedOrigin, selectedPoint, travelMode));
  };

  const toggleFavorite = () => {
    if (!selectedPoint) return;
    setFavorites((prev) =>
      prev.includes(selectedPoint.id)
        ? prev.filter((id) => id !== selectedPoint.id)
        : [selectedPoint.id, ...prev],
    );
  };

  return {
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
    selectedId,
    selectedOrigin,
    selectedPoint,
    setActiveCategory,
    setActiveRegion,
    setFavorites,
    setHoverLatLng,
    setHoverMarkerName,
    setImageIndex,
    setLightboxImage,
    setOriginId,
    setQuery,
    setResetSignal,
    setRotationLocked,
    setSearchHistory,
    setSelectedId,
    setTextureMode,
    setTravelMode,
    setZoomDistance,
    textureMode,
    toggleFavorite,
    travelMode,
    visiblePoints,
    zoomDistance,
  };
}
