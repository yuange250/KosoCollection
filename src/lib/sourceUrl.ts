/**
 * 与最初行为一致：使用数据里的来源链接（含维基百科等），不做国内站替换。
 * 仅当缺失或不是合法 http(s) URL 时，兜底到维基百科站内搜索。
 */
export function resolveSourceUrl(url: string | undefined, title: string): string {
  if (url && typeof url === 'string') {
    const t = url.trim();
    if (t) {
      try {
        const u = new URL(t);
        if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
      } catch {
        /* invalid */
      }
    }
  }
  const q = encodeURIComponent((title || 'game').trim());
  return `https://en.wikipedia.org/wiki/Special:Search?search=${q}`;
}
