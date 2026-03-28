import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (url && key) {
    const sb = createClient(url, key);
    const { data, error } = await sb.from('timeline_nodes').select('payload');
    if (!error && data?.length) {
      const list = data.map((r: { payload: unknown }) => r.payload);
      return res.status(200).json(list);
    }
    /* fall through to file if table empty or error */
  }

  try {
    const dataDir = join(process.cwd(), 'public', 'data');
    const loadFile = (abs: string): unknown[] => {
      try {
        return JSON.parse(readFileSync(abs, 'utf8')) as unknown[];
      } catch {
        return [];
      }
    };
    const byId = new Map<string, unknown>();
    const push = (arr: unknown[]) => {
      for (const n of arr) {
        if (n && typeof n === 'object' && 'id' in n && !byId.has(String((n as { id: string }).id))) {
          byId.set(String((n as { id: string }).id), n);
        }
      }
    };

    push(loadFile(join(dataDir, 'nodes.json')));

    const manPath = join(dataDir, 'bulk', 'manifest.json');
    if (existsSync(manPath)) {
      const man = JSON.parse(readFileSync(manPath, 'utf8')) as { parts?: string[] };
      for (const rel of man.parts ?? []) {
        const sub = join(dataDir, rel);
        push(loadFile(sub));
      }
    }

    push(loadFile(join(dataDir, 'nodes-bulk.json')));

    return res.status(200).json([...byId.values()]);
  } catch {
    return res.status(500).json({ error: '无法读取节点数据，请检查 public/data/nodes.json 或 Supabase 配置。' });
  }
}
