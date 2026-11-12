// Допоміжне: дістати JSON __NEXT_DATA__ і знайти в ньому масив оголошень за ознакою.
export function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function findArray(node, test, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 14) return null;
  if (Array.isArray(node) && node.length && node.some(test)) return node;
  for (const v of Object.values(node)) {
    const found = findArray(v, test, depth + 1);
    if (found) return found;
  }
  return null;
}
