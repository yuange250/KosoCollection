import { useCallback, useEffect, useState } from 'react';
import { loadMergedNodes } from '@/lib/loadNodes';
import type { TimelineNode } from '@/types/timeline';

type Status = 'idle' | 'loading' | 'error' | 'ready';

export function useNodes() {
  const [nodes, setNodes] = useState<TimelineNode[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    const base = import.meta.env.VITE_API_BASE || '';
    try {
      let res = await fetch(`${base}/api/nodes`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = (await res.json()) as TimelineNode[];
        setNodes(Array.isArray(data) ? data : []);
        setStatus('ready');
        return;
      }
      /* 老版 API 只返回单文件时继续走下方合并加载 */
    } catch {
      /* 本地未启动 API 时回退 */
    }
    try {
      const merged = await loadMergedNodes('');
      if (!merged.length) throw new Error('无节点数据');
      setNodes(merged);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { nodes, status, error, reload: load };
}
