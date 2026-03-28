import type { TimelineNode } from '@/types/timeline';

export interface FilterState {
  platforms: string[];
  genres: string[];
  regions: string[];
  vendors: string[];
  contentTypes: Array<'game' | 'host' | 'event'>;
}

export const FILTER_PLATFORMS = ['主机', 'PC', '移动', '街机'] as const;
export const FILTER_GENRES = ['FPS', 'RPG', '策略', '独立', '休闲'] as const;
export const FILTER_REGIONS = ['中国', '日本', '欧美', '全球'] as const;
export const FILTER_VENDORS = ['任天堂', '索尼', '微软', '网易', '腾讯', '世嘉', 'Capcom'] as const;

export function defaultFilters(): FilterState {
  return {
    platforms: [],
    genres: [],
    regions: [],
    vendors: [],
    contentTypes: [],
  };
}

function tagMatches(selected: string[], tags: string[]): boolean {
  if (!selected.length) return true;
  return selected.some((s) => tags.includes(s));
}

export function applyFilters(nodes: TimelineNode[], f: FilterState): TimelineNode[] {
  return nodes.filter((n) => {
    if (f.contentTypes.length && !f.contentTypes.includes(n.type)) return false;
    const tags = n.content.tags;
    if (!tagMatches(f.platforms, tags)) return false;
    if (!tagMatches(f.genres, tags)) return false;
    if (!tagMatches(f.regions, tags)) return false;
    if (!tagMatches(f.vendors, tags)) return false;
    return true;
  });
}

export function searchNodes(
  nodes: TimelineNode[],
  q: string,
): TimelineNode[] {
  const s = q.trim().toLowerCase();
  if (!s) return nodes;
  return nodes.filter((n) => {
    if (n.title.toLowerCase().includes(s)) return true;
    if (n.time.includes(s)) return true;
    if (n.content.tags.some((t) => t.toLowerCase().includes(s))) return true;
    if (n.content.intro.toLowerCase().includes(s)) return true;
    return false;
  });
}
