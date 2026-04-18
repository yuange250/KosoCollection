/**
 * 为 candidate-pois.json 中有 wikidataId 且 summary 仍为 Wikidata 占位/空的条目，
 * 从 Wikidata wbgetentities（props=descriptions）拉取 zh / en 简介，写入 summary（优先中文）。
 *
 *   node scripts/backfill-candidate-poi-descriptions.mjs
 *
 * 环境变量：BATCH<=50、SLEEP_MS、LIMIT（仅处理前 N 条待补全，用于试跑）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');

function isStubSummary(s) {
  const t = String(s ?? '').trim();
  if (!t) return true;
  return /^Wikidata/i.test(t);
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchDescriptions(ids) {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', ids.join('|'));
  url.searchParams.set('props', 'labels|descriptions');
  url.searchParams.set('languages', 'zh|en');
  url.searchParams.set('format', 'json');
  const init = {
    headers: { 'User-Agent': 'KosoCollection-backfill-desc/1.0 (contact: local-dev)' },
  };
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    init.signal = AbortSignal.timeout(60000);
  }
  const r = await fetch(url.toString(), init);
  if (!r.ok) throw new Error(`wbgetentities ${r.status}`);
  const data = await r.json();
  if (data.error) {
    const { code, info } = data.error;
    throw new Error(`wbgetentities error: ${code} — ${info}`);
  }
  return data;
}

async function fetchWithRetry(ids, retries = 3) {
  let last;
  for (let a = 0; a < retries; a += 1) {
    try {
      return await fetchDescriptions(ids);
    } catch (e) {
      last = e;
      await sleep(1500 * (a + 1));
    }
  }
  throw last;
}

function pickDescription(entity) {
  const d = entity?.descriptions ?? {};
  const l = entity?.labels ?? {};
  const zhD = d.zh?.value?.trim();
  const enD = d.en?.value?.trim();
  const zhL = l.zh?.value?.trim();
  const enL = l.en?.value?.trim();
  const text = zhD || enD || zhL || enL || null;
  return {
    descriptionZh: zhD || null,
    descriptionEn: enD || null,
    labelZh: zhL || null,
    labelEn: enL || null,
    text,
  };
}

function writeBundle(bundle) {
  bundle.updatedAt = new Date().toISOString();
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(bundle)}\n`, 'utf8');
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf8');
  const bundle = JSON.parse(raw);
  const entries = bundle.entries;
  const BATCH = Math.min(50, Math.max(1, Number(process.env.BATCH || 20)));
  const SLEEP_MS = Number(process.env.SLEEP_MS || 350);
  const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;

  let todo = entries.filter((e) => e.wikidataId && isStubSummary(e.summary));
  if (LIMIT && LIMIT > 0) todo = todo.slice(0, LIMIT);

  console.log('entries', entries.length, 'stub summary + wikidataId → todo', todo.length);

  let filled = 0;
  let skippedNoText = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const ids = chunk.map((e) => e.wikidataId);
    let data;
    try {
      data = await fetchWithRetry(ids);
    } catch (e) {
      console.error('batch failed', e.message);
      break;
    }
    const ents = data.entities ?? {};

    for (const e of chunk) {
      const ent = ents[e.wikidataId];
      const { descriptionZh, descriptionEn, labelZh, labelEn, text } = pickDescription(ent);
      if (!text) {
        skippedNoText += 1;
        continue;
      }
      e.summary = text;
      if (descriptionZh) e.descriptionZh = descriptionZh;
      if (descriptionEn) e.descriptionEn = descriptionEn;
      if (labelZh) e.labelZh = labelZh;
      if (labelEn) e.labelEn = labelEn;
      e.sources = [
        ...(e.sources || []).filter((s) => s.type !== 'wikidata-descriptions'),
        { type: 'wikidata-descriptions', note: 'wbgetentities descriptions zh|en' },
      ];
      filled += 1;
    }

    bundle.descriptionBackfill = {
      filled,
      skippedNoText,
      attempted: todo.length,
      lastBatchAt: new Date().toISOString(),
    };
    writeBundle(bundle);
    console.log('progress', Math.min(i + BATCH, todo.length), '/', todo.length, 'filled', filled);
    await sleep(SLEEP_MS);
  }

  const prev = bundle.descriptionBackfill;
  const baseTotal = prev ? Number(prev.filledTotal ?? prev.filled ?? 0) : 0;
  bundle.descriptionBackfill = {
    filledThisRun: filled,
    filledTotal: baseTotal + filled,
    skippedNoText,
    attempted: todo.length,
    note: 'Wikidata labels|descriptions (zh preferred; label fallback)',
  };
  writeBundle(bundle);
  console.log('done. filledThisRun', filled, 'filledTotal', bundle.descriptionBackfill.filledTotal, 'skipped', skippedNoText);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
