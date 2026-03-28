/**
 * AI 辅助抓取与结构化示例脚本（PRD 3.2）。
 * 依赖：OPENAI_API_KEY；可选 PEXELS_API_KEY 用于配图。
 * 运行：npm run ingest -- --topic "1996 主机大战"
 *
 * 输出：打印 JSON 节点数组；若配置 Supabase 可写入（需自行取消注释）。
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function env(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

async function openaiStructure(topic) {
  const key = env('OPENAI_API_KEY');
  if (!key) {
    console.error('未设置 OPENAI_API_KEY，跳过模型调用。');
    return null;
  }
  const model = env('OPENAI_MODEL', 'gpt-4o');
  const system = `你是游戏史研究助理。只输出一个 JSON 数组，元素格式：
{"id":"slug-english","time":"YYYY 或 YYYY-MM-DD","type":"game|host|event","title":"中文标题","content":{"intro":"100-200字中文","details":{...},"imageUrl":"/placeholders/game.svg","sourceUrl":"https://...","tags":["平台","类型","地区"]},"relatedNodes":[]}
details 按 type 填 PRD 字段；无信息填不详/无；tags 含 主机/PC/移动/街机 之一与 中国/日本/欧美/全球 之一。`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `请根据主题生成 3 条权威可引用的游戏史节点（中文）：${topic}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error('OpenAI HTTP', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) {
    console.error('模型未返回 JSON 数组:', text.slice(0, 500));
    return null;
  }
  try {
    return JSON.parse(m[0]);
  } catch (e) {
    console.error('JSON 解析失败', e);
    return null;
  }
}

async function pexelsImage(query) {
  const key = env('PEXELS_API_KEY');
  if (!key) return null;
  const u = new URL('https://api.pexels.com/v1/search');
  u.searchParams.set('query', query);
  u.searchParams.set('per_page', '1');
  const res = await fetch(u, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const j = await res.json();
  const src = j.photos?.[0]?.src?.large;
  return src || null;
}

async function main() {
  const topic = process.argv.slice(2).join(' ') || '1972 Pong 街机 历史';
  const nodes = await openaiStructure(topic);
  if (!nodes) {
    process.exitCode = 1;
    return;
  }

  for (const n of nodes) {
    if (!n.content?.imageUrl?.startsWith('http')) {
      const q = `${n.title} video game`.slice(0, 80);
      const url = await pexelsImage(q);
      if (url) n.content.imageUrl = url;
    }
  }

  const outPath = join(root, 'local-data', 'ingest-out.json');
  try {
    writeFileSync(outPath, JSON.stringify(nodes, null, 2), 'utf8');
    console.log('已写入', outPath);
  } catch {
    console.log(JSON.stringify(nodes, null, 2));
  }

  /* Supabase 写入示例（需 @supabase/supabase-js 与 key）：
  import { createClient } from '@supabase/supabase-js';
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  for (const n of nodes) {
    await sb.from('timeline_nodes').upsert({ id: n.id, payload: n });
  }
  */
}

main();
