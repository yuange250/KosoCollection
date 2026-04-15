# 科索造物集 · KosoWorld

与 AI 协作的数字造物实验站。以可迭代的作品集合，持续探索并产出有意思的数字内容。

当前上线的首个作品：**游戏史时间轴** — React + D3 多级缩放、筛选与搜索、详情卡片（含关联跳转）、占位图、本地持久化视图、移动端纵向浏览。

## 本地开发

```bash
npm install
npm run dev
```

默认同时启动 Vite（5173）与本地 API（3001，见 `server/index.mjs`）。`vite.config.ts` 将 `/api` 代理到 `127.0.0.1:3001`。

- 仅前端：`npm run dev:client`（无 `/api`，时间轴数据仍可读静态 JSON）
- 节点数据：静态文件 `public/data/nodes.json`（无数据库时自动回退）
- 作品二图库：默认由 `src/lib/worldsceneStockPhotos.ts` 从 Unsplash CDN 按景点 id 稳定选图（URL 需带 `ixlib`，图池见文件内 `WORKING` 列表，均为当前仍可 200 的 photo id）。离线或部署机不可访问外网时，在项目根执行 `npm run cache:worldscene-unsplash`（需访问 `images.unsplash.com`）。脚本会校验每条目的「分类 category」与 `wmCard(kind)` 是否一致，通过后将图保存到 `public/images/worldscene/stock-*` 并生成 `src/lib/worldsceneStockCached.gen.ts`；`stock-*` 已 gitignore。若只提交代码不附带图片，请保持 `worldsceneStockCached.gen.ts` 为空对象 `{}` 以免他人构建后详情图指向不存在的本地路径。分类与 kind 故意不一致时用 `--force` 仍生成缓存。历史脚本 `npm run cache:worldscene-images` 仅面向旧版 Wikimedia 外链。

## 生产构建

```bash
npm run build
npm run preview
```

本机模拟生产（Linux/macOS）：`npm run build && npm start`（`NODE_ENV=production` 下由 `server/index.mjs` 托管 `dist/` 并提供 `/api/*`）。Windows 可先在 PowerShell 中执行 `$env:NODE_ENV="production"; node server/index.mjs`。

## 后端能力（反馈、访问统计、周报）

长驻 Node 服务（`server/index.mjs`）提供：

- `GET /api/nodes`：合并磁盘上的时间轴 JSON
- `POST /api/feedback`：写入 SQLite（`server-data/kosoworld.db`，已 gitignore），并异步发邮件通知
- `POST /api/visit`：记录页面路径、Referrer、UA、IP（前端 `PageTracker` 在路由变化时上报）

邮件与周报依赖 **163 SMTP 授权码**（非登录密码）：`SMTP_USER`、`SMTP_PASS`；收件人 `NOTIFY_EMAIL`（默认 `chen_the_best@163.com`）。配置后，新反馈会发到该邮箱；**每周一 10:00（Asia/Shanghai）** 发送上一自然周（上周一至周日，上海时区）的访问与反馈摘要。

生产站点与 API **同域**时，构建前端**不要**设置 `VITE_API_BASE`，浏览器用相对路径请求 `/api/*` 即可。若 API 在另一域名，再在构建环境设置 `VITE_API_BASE=https://api.example.com`。

## 部署到 Vercel

1. 将仓库导入 Vercel，框架选 "Other"，构建命令 `npm run build`，输出目录 `dist`。
2. 不配环境变量时：`/api/nodes` 会读取仓库内 `public/data/nodes.json`；`/api/feedback` 需要数据库，否则会返回 501 提示。
3. 使用 Supabase 时，在 Vercel 设置：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端，勿泄露到前端）

在 Supabase SQL 编辑器执行 `supabase/migrations/001_init.sql`，然后将节点导入表 `timeline_nodes`（`id` + `payload` JSON）。有数据后 `/api/nodes` 优先读库。

反馈写入 `feedback` 表；抓取日志可写入 `fetch_logs`（脚本或定时任务自行调用）。

## 部署到阿里云 ECS（推荐：Node + nginx 反代）

推荐形态：**systemd 常驻 Node**（`server/index.mjs` 提供静态站 + `/api/*`）+ **nginx 反向代理** 80/443。节点数据仍来自构建进 `dist/` 的 `public/data/*.json`；反馈与访问统计在服务器本地 **SQLite**（`server-data/`）。

### 方式 A：一键脚本（Ubuntu / Debian / **Alibaba Cloud Linux**）

1. 将仓库拷到服务器（或在本机打包后上传）：
   - Linux/macOS：`bash deploy/pack-ecs-bundle.sh` 生成 `kosoworld-ecs-bundle-日期.tar.gz`
   - Windows：`powershell -File deploy/pack-ecs-bundle.ps1` 生成 `kosoworld-ecs-bundle-日期.zip`
2. 在服务器解压进入**项目根目录**（含 `package.json` 的那一层），**务必传入 163 邮箱 SMTP**（否则反馈通知与周报邮件不会发出）：
   ```bash
   chmod +x deploy/install-ecs.sh
   SMTP_USER=你的发件邮箱@163.com SMTP_PASS=你的163授权码 ./deploy/install-ecs.sh
   ```
   脚本会安装 Node 20、nginx、**better-sqlite3 所需编译链**（`build-essential` / `gcc-c++` `make` `python3`）、rsync 等，执行 `npm ci && npm run build`，注册并启动 **systemd 服务 `kosoworld`**（默认监听 `127.0.0.1:3001`），并写入 nginx 反代配置（**Alinux / RHEL** 为 `/etc/nginx/conf.d/kosoworld.conf`，**Debian 系** 为 `sites-available` + `sites-enabled`）。
3. 在阿里云控制台为实例安全组**放行 TCP 80**（HTTPS 则再加 443）。域名解析到公网 IP 后可用 `certbot` 等替换 `/etc/nginx/ssl/` 下自签名证书。

常用环境变量：

- `DOMAIN=你的域名` — nginx `server_name`，默认 `_`
- `NODE_PORT=3001` — Node 监听端口（与 nginx `upstream` 一致）
- `SMTP_HOST` / `SMTP_PORT` — 默认 `smtp.163.com` / `465`
- `SMTP_USER` / `SMTP_PASS` — **必填**（163 授权码，非登录密码）才能发邮件
- `NOTIFY_EMAIL` — 收件人，默认 `chen_the_best@163.com`
- `REMOVE_NGINX_DEFAULT=0` — 保留 nginx 默认站点（默认会删，避免抢 80）

**生产环境（ECS）与邮件：** 部署时若已按上文执行 `SMTP_USER=... SMTP_PASS=... ./deploy/install-ecs.sh`，脚本会把 `SMTP_*` 与 `NOTIFY_EMAIL` 写入 **systemd** 服务单元（`kosoworld.service`）。此后由 systemd 拉起的 Node 进程会带上这些环境变量，**只有在这种配置下**，用户新提交的反馈才会经 SMTP 转发到 `NOTIFY_EMAIL`（默认 `chen_the_best@163.com`）。若首次部署未传入 SMTP，反馈仍会写入服务器上的 SQLite，但不会发邮件；可补全环境变量后重新执行安装脚本，或手动编辑该 unit 并执行 `sudo systemctl daemon-reload && sudo systemctl restart kosoworld`。

运维：`sudo systemctl status kosoworld`、`sudo journalctl -u kosoworld -f`、`sudo systemctl restart kosoworld`。

前端与 API **同域**时，构建产物里**不要**设置 `VITE_API_BASE`，由浏览器请求相对路径 `/api/*` 即可。

若 `nginx -t` 通过但启动失败：`bind() ... Address already in use` 表示 **80/443 已被占用**。其它原因：**TLS 私钥权限**、**SELinux** 等见脚本注释。

### 方式 B：Docker

在仓库根目录：

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

当前仓库内的 Docker 镜像若以**仅 nginx 静态**为主，可能与「反馈 / 访问统计 / 周报」完整能力不一致；ECS 上优先用**方式 A**。修改端口可编辑 `deploy/docker-compose.yml`。

> 说明：Vercel 托管的 `api/nodes` 等与自建 Node + SQLite 是不同部署模型；要在 Vercel 上实现同等反馈与统计，需另行接 Serverless + 数据库。

## 作品一：游戏史时间轴

### 大批量游戏数据（国内源）

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
- 定时抓取与备份策略请在后端或 Supabase 控制台按业务再配置。


