-- 节点表：与前端 TimelineNode JSON 一致，整包存入 payload
create table if not exists public.timeline_nodes (
  id text primary key,
  payload jsonb not null
);

create index if not exists idx_timeline_nodes_time on public.timeline_nodes ((payload->>'time'));

-- 用户反馈
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null default '',
  email text not null,
  content text not null
);

-- AI / 定时任务抓取日志
create table if not exists public.fetch_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null default 'info',
  message text not null,
  meta jsonb
);

-- 匿名只读节点（若需公开站点用 anon key 只读）
alter table public.timeline_nodes enable row level security;
alter table public.feedback enable row level security;
alter table public.fetch_logs enable row level security;

-- 开发阶段可用：允许所有人读取节点（上线请改为更严格策略）
create policy "timeline_nodes_read_all" on public.timeline_nodes for select using (true);

-- 反馈仅服务端写入；禁止匿名 insert（走 API + service role 绕过 RLS）
create policy "feedback_deny_all" on public.feedback for all using (false);

create policy "fetch_logs_deny_all" on public.fetch_logs for all using (false);

comment on table public.timeline_nodes is '时间轴节点，payload 结构见 PRD JSON';
comment on table public.feedback is '反馈建议，由 service role 写入';
comment on table public.fetch_logs is 'AI 抓取与错误日志';
