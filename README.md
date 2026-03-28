# 游戏史 · 多级缩放时间轴

根据仓库内 PRD 实现的交互式游戏史时间轴：React + D3 多级缩放、筛选与搜索、详情卡片（含关联跳转）、占位图、本地持久化视图、Supabase 可选接入、Vercel 部署与 AI 抓取示例脚本。

## 本地开发

```bash
npm install
npm run dev
```

默认同时启动 Vite（5173）与本地 API（3001，见 `server/dev-api.mjs`）。前端通过代理访问 `/api/*`。

- 仅前端：`npm run dev:client`
- 节点数据：静态文件 `public/data/nodes.json`（无数据库时自动回退）

## 生产构建

```bash
npm run build
npm run preview
```

## 部署到 Vercel

1. 将仓库导入 Vercel，框架选 “Other”，构建命令 `npm run build`，输出目录 `dist`。
2. 不配环境变量时：`/api/nodes` 会读取仓库内 `public/data/nodes.json`；`/api/feedback` 需要数据库，否则会返回 501 提示。
3. 使用 Supabase 时，在 Vercel 设置：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端，勿泄露到前端）

在 Supabase SQL 编辑器执行 `supabase/migrations/001_init.sql`，然后将节点导入表 `timeline_nodes`（`id` + `payload` JSON）。有数据后 `/api/nodes` 优先读库。

反馈写入 `feedback` 表；抓取日志可写入 `fetch_logs`（脚本或定时任务自行调用）。

## 部署到阿里云 ECS

前端为纯静态资源（`npm run build` 产出 `dist/`）。默认数据来自构建进产物的 `public/data/*.json`，**无需 Node 常驻进程**即可浏览时间轴。

### 方式 A：一键脚本（Ubuntu / Debian / **Alibaba Cloud Linux**）

1. 将仓库拷到服务器（或在本机打包后上传）：
   - Linux/macOS：`bash deploy/pack-ecs-bundle.sh` 生成 `gamehistory-ecs-bundle-日期.tar.gz`
   - Windows：`powershell -File deploy/pack-ecs-bundle.ps1` 生成 `gamehistory-ecs-bundle-日期.zip`
2. 在服务器解压进入**项目根目录**（含 `package.json` 的那一层），执行：
   ```bash
   chmod +x deploy/install-ecs.sh
   ./deploy/install-ecs.sh
   ```
   脚本会安装 Node 20、nginx、rsync，执行 `npm ci && npm run build`，把 `dist/` 同步到 `/var/www/gamehistory` 并写入 nginx（SPA `try_files` 回退 `index.html`）。**Alinux / RHEL 系**使用 `/etc/nginx/conf.d/gamehistory.conf`；**Debian 系**使用 `sites-available` + `sites-enabled`。默认会移除自带的 `default` 站点以免抢 80 端口。
3. 在阿里云控制台为实例安全组**放行 TCP 80**（HTTPS 则再加 443）。可选：域名解析到公网 IP，再用 `certbot` 等签发证书。

环境变量（可选）：

- `DOMAIN=你的域名` — `server_name`，默认 `_`
- `WEBROOT=/var/www/gamehistory` — 静态根目录
- `REMOVE_NGINX_DEFAULT=0` — 保留 nginx 默认站点（默认会删，避免单机部署冲突）

### 方式 B：Docker

在仓库根目录：

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

默认映射本机 **80** → 容器 80、**443** → 容器 443（容器内为自签名证书，浏览器会提示不安全，生产请挂载真实证书或前置反代）。修改端口可编辑 `deploy/docker-compose.yml`。

> 说明：Vercel 上的 `/api/*` 在纯静态 ECS 上不可用；无 Supabase 时前端仍读静态 JSON。若要在 ECS 上提供 API，需自行部署 Node 服务或接 Supabase。

## 大批量游戏数据（国内源）

加载顺序（`id` 去重，**精编 `nodes.json` 永远优先**）：

1. `public/data/nodes.json` — 主机/事件/精编游戏  
2. `public/data/bulk/manifest.json` 所列分片 — **`npm run fetch:bgm:cn`** 拉取的 Bangumi 游戏数据；**`npm run gen:cn-bulk`** 生成至少 1000 条「国内」标签补量（`bulk/nodes-cn-0000.json`，默认 1200 条，可用 `TARGET=2000` 等加大）  
3. `public/data/nodes-bulk.json` — 可选全区域程序化补量（`npm run gen:bulk`）

**Bangumi 批量抓取（推荐）**：

```bash
npm run fetch:bgm:cn
```

可选环境变量：

- `BGM_START_PAGE`：起始页，默认 `1`
- `BGM_MAX_PAGES`：抓取页数，默认 `120`（每页 30）
- `BGM_SORT`：`rank` 或 `date`
- `BGM_CHUNK_SIZE`：分片大小，默认 `4000`
- `BGM_SLEEP_MS`：请求间隔，默认 `180`

该命令会生成 `public/data/bulk/nodes-bgm-*.json` 与 `manifest.json`，前端会自动按 manifest 加载。

输出目录：`public/data/bulk/nodes-bgm-*.json` + `manifest.json`。前端会按 manifest **分片请求**，避免单文件过大。

### 精编节点封面图（国内源优先）

`public/data/nodes.json` 里若仍使用 `/placeholders/*.svg`，可运行：

```bash
npm run enrich:images
```

脚本按以下顺序补图（仅国内来源）：

1. **百度百科开放接口**（词条配图）
2. **Bangumi 搜索接口**（游戏封面）

可选环境变量：

- `DRY_RUN=1`：只打印不写入。
- `BAIDU_SLEEP_MS` / `BGM_SLEEP_MS`：各源请求间隔（毫秒）。

默认处理 `public/data/nodes.json`；可传路径：`npm run enrich:images -- public/data/other.json`。写入前会备份为 `*.json.bak`。

### 封面图本地化（省外站带宽）

精编或补全后，`imageUrl` 可能仍是外链。若希望用户只从你方静态站拉图（减轻外部依赖与出口流量），在构建或发布前执行：

```bash
npm run cache:images
```

会将所有外链下载到 `public/images/nodes/`（按 URL 哈希命名，同 URL 只存一份），并把对应 JSON 里的 `imageUrl` 改成 `/images/nodes/xxx.jpg` 这类站内路径。可多文件：

`npm run cache:images -- public/data/nodes.json public/data/nodes-bulk.json`

- `SKIP_EXISTING=1`：已存在文件则不再下载（适合断点续跑）。
- `DRY_RUN=1`：只演练不写入。

**注意**：十万级以上节点时，浏览器内存与 Vercel `/api/nodes` 响应体积可能吃紧，**生产环境请把数据放进 Supabase**（或自建 API 分页），静态全量 JSON 仅适合中小规模或本机演示。

## AI 抓取示例

1. 复制 `.env.example` 为 `.env`，填写 `OPENAI_API_KEY`（可选 `PEXELS_API_KEY`）。
2. 运行：`npm run ingest -- "你的主题"`

结果写入 `local-data/ingest-out.json`。若要写入 Supabase，可在 `scripts/ingest.mjs` 中取消注释示例代码并安装依赖（已含 `@supabase/supabase-js`）。

## 合规与维护

- 图片来源请确认可用性与授权；占位图见 `public/placeholders/*.svg`。
- 定时抓取与备份策略请在后端或 Supabase 控制台按业务再配置（PRD 建议周更与异地备份）。
