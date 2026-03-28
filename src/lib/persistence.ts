import type { ZoomLayer } from '@/types/timeline';

const KEY = 'gamehistory-timeline-v1';

export interface PersistedTimeline {
  domain: [number, number];
  layer: ZoomLayer;
}

export function loadPersisted(): PersistedTimeline | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PersistedTimeline;
    if (
      Array.isArray(p.domain) &&
      p.domain.length === 2 &&
      typeof p.domain[0] === 'number' &&
      typeof p.domain[1] === 'number' &&
      (p.layer === 'decade' || p.layer === 'year' || p.layer === 'day')
    ) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function savePersisted(p: PersistedTimeline): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
