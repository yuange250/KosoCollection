import type { DestinationPoint } from './worldsceneData';

export type WorldSceneDisplayTier = 'iconic' | 'major' | 'standard';

export interface WorldSceneCityHotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  priority: number;
}

export const CHINA_CITY_HOTSPOTS: readonly WorldSceneCityHotspot[] = [
  { id: 'cn-beijing', name: '北京', lat: 39.9042, lng: 116.4074, priority: 10 },
  { id: 'cn-shanghai', name: '上海', lat: 31.2304, lng: 121.4737, priority: 10 },
  { id: 'cn-guangzhou', name: '广州', lat: 23.1291, lng: 113.2644, priority: 9 },
  { id: 'cn-shenzhen', name: '深圳', lat: 22.5431, lng: 114.0579, priority: 9 },
  { id: 'cn-hangzhou', name: '杭州', lat: 30.2741, lng: 120.1551, priority: 9 },
  { id: 'cn-chengdu', name: '成都', lat: 30.5728, lng: 104.0668, priority: 9 },
  { id: 'cn-chongqing', name: '重庆', lat: 29.563, lng: 106.5516, priority: 9 },
  { id: 'cn-xian', name: '西安', lat: 34.3416, lng: 108.9398, priority: 8 },
  { id: 'cn-kunming', name: '昆明', lat: 25.0389, lng: 102.7183, priority: 8 },
  { id: 'cn-lhasa', name: '拉萨', lat: 29.652, lng: 91.1721, priority: 7 },
  { id: 'cn-urumqi', name: '乌鲁木齐', lat: 43.8256, lng: 87.6168, priority: 7 },
  { id: 'cn-harbin', name: '哈尔滨', lat: 45.8038, lng: 126.5349, priority: 7 },
];

export function getWorldSceneDisplayTier(point: DestinationPoint): WorldSceneDisplayTier {
  void point;
  return 'iconic';
}

export function visibleTiersByZoom(zoomDistance: number) {
  void zoomDistance;
  return new Set<WorldSceneDisplayTier>(['iconic']);
}

export function chinaCityHotspotLimitByZoom(zoomDistance: number) {
  if (zoomDistance <= 1.8) return 12;
  if (zoomDistance <= 2.05) return 8;
  if (zoomDistance <= 2.25) return 5;
  return 0;
}