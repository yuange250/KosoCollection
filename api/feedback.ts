import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type Body = { name?: string; email?: string; content?: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: Body;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Body)
        : (req.body as Body);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  if (!body.email || !body.content) {
    return res.status(400).json({ error: 'email 与 content 必填' });
  }

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (url && key) {
    const sb = createClient(url, key);
    const { error } = await sb.from('feedback').insert({
      name: body.name ?? '',
      email: body.email,
      content: body.content,
    });
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(501).json({
    error:
      '未配置 Supabase。请在 Vercel 环境变量中设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，本地开发请运行 node server/dev-api.mjs 并走代理。',
  });
}
