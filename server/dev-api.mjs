import http from 'node:http';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function mergeNodesFromDisk() {
  const dataDir = path.join(root, 'public', 'data');
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
      if (n && n.id && !byId.has(n.id)) byId.set(n.id, n);
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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/nodes')) {
    try {
      const merged = mergeNodesFromDisk();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(merged));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/feedback')) {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      try {
        const dir = path.join(root, 'local-data');
        fs.mkdirSync(dir, { recursive: true });
        const line =
          JSON.stringify({
            at: new Date().toISOString(),
            raw: JSON.parse(body || '{}'),
          }) + '\n';
        fs.appendFileSync(path.join(dir, 'feedback.ndjson'), line, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3001, '127.0.0.1', () => {
  console.log('dev API http://127.0.0.1:3001 (nodes + feedback)');
});
