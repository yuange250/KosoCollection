import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, normalizeDedupeKey } from './slugify.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, '..', '..');
export const DATA_TS = path.join(ROOT, 'src', 'lib', 'worldsceneData.ts');
export const OUT_JSON = path.join(ROOT, 'data', 'worldscene', 'candidate-pois.json');

export function parseExistingDestinationIds(ts) {
  const start = ts.indexOf('export const DESTINATION_POINTS');
  const end = ts.indexOf('export const ORIGIN_PRESETS', start);
  if (start === -1 || end === -1) return new Set();
  const block = ts.slice(start, end);
  const ids = new Set();
  const re = /\n\s{4}id: '([^']+)'/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/** 稳定 id：英文名 +（城市或国家）避免跨国重名。 */
export function assignId(entry, used) {
  const base = slugify(entry.englishName || entry.name);
  const cityRaw = entry.city && String(entry.city).trim() && entry.city !== '—' ? entry.city : '';
  const countryRaw =
    entry.country && String(entry.country).trim() && entry.country !== '—' ? entry.country : '';
  const city = slugify(cityRaw);
  const country = slugify(countryRaw);
  const parts = [base, city || null, !city && country ? country : null].filter(Boolean);
  let id = parts.join('-');
  if (!id) id = `poi-${Math.random().toString(36).slice(2, 10)}`;
  let candidate = id;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${id}-${n}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

export function seedsToEntries(seeds, existingIds) {
  const used = new Set(existingIds);
  const byDedupe = new Map();
  const entries = [];
  const duplicates = [];

  for (const raw of seeds) {
    const dedupeKey = raw.wikidataId
      ? `wd:${raw.wikidataId}`
      : normalizeDedupeKey(raw.englishName || raw.name, raw.country);
    if (byDedupe.has(dedupeKey)) {
      duplicates.push({ dedupeKey, skipped: raw.englishName || raw.name, kept: byDedupe.get(dedupeKey) });
      continue;
    }
    const id = assignId(raw, used);
    byDedupe.set(dedupeKey, id);
    const overlap = existingIds.has(id) ? 'same-id-as-app' : undefined;
    entries.push({
      id,
      name: raw.name,
      englishName: raw.englishName,
      aliases: raw.aliases ?? [],
      country: raw.country,
      region: raw.region,
      city: raw.city,
      category: raw.category,
      prominence: raw.prominence ?? 'regional',
      tags: raw.tags ?? [],
      summary: raw.summary ?? '',
      lat: raw.lat ?? null,
      lng: raw.lng ?? null,
      wikidataId: raw.wikidataId ?? null,
      unescoId: raw.unescoId ?? null,
      sources: raw.sources ?? [{ type: 'seed', note: 'manual / curated list' }],
      status: 'candidate',
      dedupeKey,
      overlap,
    });
  }

  return { entries, duplicates };
}

export function writeBundle(entries, meta, { compact = false } = {}) {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  const bundle = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    description:
      '蓝星之美后续扩充用候选景点（未上架）。与 src/lib/worldsceneData.ts 中的已上架景点独立维护。',
    ...meta,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
  };
  const text = compact ? `${JSON.stringify(bundle)}\n` : `${JSON.stringify(bundle, null, 2)}\n`;
  fs.writeFileSync(OUT_JSON, text, 'utf8');
  return bundle;
}
