import type { TimelineNode } from '@/types/timeline';

type BulkManifest = { parts?: string[] };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** 分片拉取 bulk，避免单次请求过大 */
async function loadBulkManifestParts(baseUrl: string): Promise<TimelineNode[]> {
  const manifest = await fetchJson<BulkManifest>(`${baseUrl}/data/bulk/manifest.json`);
  const rel = manifest?.parts;
  if (!rel?.length) return [];

  const concurrency = 4;
  const out: TimelineNode[] = [];
  for (let i = 0; i < rel.length; i += concurrency) {
    const slice = rel.slice(i, i + concurrency);
    const batches = await Promise.all(
      slice.map(async (p) => {
        const arr = await fetchJson<TimelineNode[]>(`${baseUrl}/data/${p}`);
        return Array.isArray(arr) ? arr : [];
      }),
    );
    for (const b of batches) out.push(...b);
  }
  return out;
}

/**
 * 合并数据（精编优先，同 id 不覆盖）：
 * 1. nodes.json
 * 2. bulk/manifest 分片（国内源批量）
 * 3. nodes-bulk.json（程序化补量）
 */
export async function loadMergedNodes(baseUrl = ''): Promise<TimelineNode[]> {
  const curated =
    (await fetchJson<TimelineNode[]>(`${baseUrl}/data/nodes.json`))?.filter(Boolean) ?? [];
  const bulkChunks = await loadBulkManifestParts(baseUrl);
  const procedural =
    (await fetchJson<TimelineNode[]>(`${baseUrl}/data/nodes-bulk.json`))?.filter(Boolean) ?? [];

  const byId = new Map<string, TimelineNode>();
  for (const n of curated) {
    if (n?.id) byId.set(n.id, n);
  }
  for (const n of bulkChunks) {
    if (n?.id && !byId.has(n.id)) byId.set(n.id, n);
  }
  for (const n of procedural) {
    if (n?.id && !byId.has(n.id)) byId.set(n.id, n);
  }

  return [...byId.values()];
}
