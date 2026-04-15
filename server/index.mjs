import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertFeedback, insertVisit } from './db.mjs';
import { sendFeedbackNotification } from './email.mjs';
import { startWeeklyCron, buildReport } from './cron.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '256kb' }));

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    ''
  );
}

// ---------- 节点数据 ----------

function mergeNodesFromDisk() {
  const dataDir = isProduction
    ? path.join(root, 'dist', 'data')
    : path.join(root, 'public', 'data');
  const loadFile = (abs) => {
    try {
      return JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch {
      return [];
    }
  };
  const byId = new Map();
  const push = (arr) => {
    for (const n of arr) {
      if (n?.id && !byId.has(n.id)) byId.set(n.id, n);
    }
  };
  push(loadFile(path.join(dataDir, 'nodes.json')));
  const manPath = path.join(dataDir, 'bulk', 'manifest.json');
  if (fs.existsSync(manPath)) {
    const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
    for (const rel of man.parts ?? []) {
      push(loadFile(path.join(dataDir, rel)));
    }
  }
  push(loadFile(path.join(dataDir, 'nodes-bulk.json')));
  return [...byId.values()];
}

app.get('/api/nodes', (_req, res) => {
  try {
    res.json(mergeNodesFromDisk());
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- 反馈 ----------

app.post('/api/feedback', async (req, res) => {
  const { name = '', email = '', content = '' } = req.body || {};
  if (!email || !content) {
    return res.status(400).json({ error: '邮箱和反馈内容为必填' });
  }
  try {
    insertFeedback.run(name, email, content, clientIp(req), req.headers['user-agent'] || '');
    res.json({ ok: true });
    sendFeedbackNotification({ name, email, content }).catch(() => {});
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- 访问统计 ----------

app.post('/api/visit', (req, res) => {
  const { path: pagePath = '/', referrer = '', screenW = 0, screenH = 0 } = req.body || {};
  try {
    insertVisit.run(
      String(pagePath).slice(0, 500),
      String(referrer).slice(0, 1000),
      (req.headers['user-agent'] || '').slice(0, 500),
      clientIp(req),
      Number(screenW) || 0,
      Number(screenH) || 0,
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---------- 生产环境：静态文件 + SPA 回退 ----------

if (isProduction) {
  const distDir = path.join(root, 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  // 带 hash 的 /assets/* 可长缓存；index.html 必须可更新，否则部署后浏览器一直用旧壳子
  app.use(
    express.static(distDir, {
      maxAge: '7d',
      setHeaders(res, filePath) {
        const p = filePath.replace(/\\/g, '/');
        if (p.endsWith('/index.html') || p.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  // Express 5：path-to-regexp v8 不接受字面量 '*' 路径
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml, (err) => (err ? next(err) : undefined));
  });
}

// ---------- 启动 ----------

app.listen(PORT, HOST, () => {
  console.log(`[server] 已启动 http://${HOST}:${PORT} (${isProduction ? '生产' : '开发'}模式)`);
  startWeeklyCron();
});
