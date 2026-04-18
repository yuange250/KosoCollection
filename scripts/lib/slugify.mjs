/** ASCII slug for candidate ids (kebab-case). */
export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizeDedupeKey(name, country) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[（）()【】\[\]'’`]/g, '')
    .trim();
  const c = String(country || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return `${n}|${c}`;
}
