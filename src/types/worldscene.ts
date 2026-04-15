import type { OriginPreset, TravelMode } from '@/lib/worldsceneData';

export interface RouteState {
  origin: OriginPreset;
  mode: TravelMode;
  distanceKm: number;
  durationHours: number;
  routeNodes: string[];
}

export interface PriceBreakdown {
  transport: number;
  ticket: number;
  lodging: number;
  dining: number;
  minTotal: number;
  maxTotal: number;
}
