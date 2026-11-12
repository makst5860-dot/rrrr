// willhaben.at (Австрія) — дані беремо з JSON __NEXT_DATA__ на сторінці пошуку.
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://www.willhaben.at';

function findAdverts(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (Array.isArray(node.advertSummary)) return node.advertSummary;
  for (const v of Object.values(node)) {
    const found = findAdverts(v, depth + 1);
    if (found) return found;
  }
  return null;
}

const attr = (ad, name) => {
  const list = ad?.attributes?.attribute || [];
  const a = list.find((x) => x.name === name);
  return a?.values?.[0] ?? null;
};

export default {
  id: 'willhaben',
  name: 'willhaben',
  flag: '🇦🇹',
  async search(query, { maxPrice }) {
    const url = `${BASE}/iad/kaufen-und-verkaufen/marktplatz?keyword=${encodeURIComponent(query)}&PRICE_TO=${maxPrice}&sort=1&rows=60`;
    const html = await get(url, { lang: 'de-AT,de;q=0.9' });
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return { items: [], blocked: true, sample: html };
    const adverts = findAdverts(JSON.parse(m[1])) || [];
    const items = adverts.map((ad) => {
      const seo = attr(ad, 'SEO_URL');
      const priceRaw = attr(ad, 'PRICE');
      const priceText = attr(ad, 'PRICE_FOR_DISPLAY') || (priceRaw ? `€ ${priceRaw}` : '');
      const img = ad?.advertImageList?.advertImage?.[0];
      return {
        id: `wh:${ad.id}`,
        title: ad.description || attr(ad, 'HEADING') || '',
        description: attr(ad, 'BODY_DYN') || '',
        priceText,
        priceAmount: priceRaw != null ? Number(priceRaw) : parsePrice(priceText),
        currency: 'EUR',
        url: seo ? `${BASE}/iad/${seo.replace(/^\/+/, '')}` : `${BASE}/iad/object?adId=${ad.id}`,
        image: img?.mainImageUrl || img?.referenceImageUrl || img?.thumbnailImageUrl || null,
        location: [attr(ad, 'POSTCODE'), attr(ad, 'LOCATION')].filter(Boolean).join(' '),
        postedAt: attr(ad, 'PUBLISHED_String') || null,
      };
    });
    return { items };
  },
};
