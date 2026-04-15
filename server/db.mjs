import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'server-data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'kosoworld.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT DEFAULT '',
    email     TEXT NOT NULL,
    content   TEXT NOT NULL,
    ip        TEXT DEFAULT '',
    ua        TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS visits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    path       TEXT NOT NULL,
    referrer   TEXT DEFAULT '',
    ua         TEXT DEFAULT '',
    ip         TEXT DEFAULT '',
    screen_w   INTEGER DEFAULT 0,
    screen_h   INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export const insertFeedback = db.prepare(
  `INSERT INTO feedback (name, email, content, ip, ua) VALUES (?, ?, ?, ?, ?)`,
);

export const insertVisit = db.prepare(
  `INSERT INTO visits (path, referrer, ua, ip, screen_w, screen_h) VALUES (?, ?, ?, ?, ?, ?)`,
);

export const countVisitsSince = db.prepare(
  `SELECT COUNT(*) AS total FROM visits WHERE created_at >= ?`,
);

export const countVisitsBetween = db.prepare(
  `SELECT COUNT(*) AS total FROM visits WHERE created_at >= ? AND created_at < ?`,
);

export const uniqueIpsSince = db.prepare(
  `SELECT COUNT(DISTINCT ip) AS total FROM visits WHERE created_at >= ?`,
);

export const uniqueIpsBetween = db.prepare(
  `SELECT COUNT(DISTINCT ip) AS total FROM visits WHERE created_at >= ? AND created_at < ?`,
);

export const topPagesSince = db.prepare(
  `SELECT path, COUNT(*) AS cnt FROM visits WHERE created_at >= ? GROUP BY path ORDER BY cnt DESC LIMIT 20`,
);

export const topPagesBetween = db.prepare(
  `SELECT path, COUNT(*) AS cnt FROM visits WHERE created_at >= ? AND created_at < ? GROUP BY path ORDER BY cnt DESC LIMIT 20`,
);

export const recentFeedbackSince = db.prepare(
  `SELECT id, name, email, content, created_at FROM feedback WHERE created_at >= ? ORDER BY created_at DESC`,
);

export const recentFeedbackBetween = db.prepare(
  `SELECT id, name, email, content, created_at FROM feedback WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC`,
);

export const allFeedback = db.prepare(
  `SELECT id, name, email, content, created_at FROM feedback ORDER BY created_at DESC LIMIT 100`,
);

export default db;
