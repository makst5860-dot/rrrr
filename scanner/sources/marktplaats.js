// Marktplaats.nl (Нідерланди) і 2dehands.be (Бельгія) — однаковий JSON API.
import { get } from '../lib/http.js';

function makeSource({ id, name, flag, base, lang }) {
  return {
    id,
    name,
    flag,
    async search(query) {
      const url = `${base}/lrp/api/search?query=${encodeURIComponent(query)}&limit=100&offset=0&sortBy=SORT_INDEX&sortOrder=DECREASING&viewOptions=list-view`;
      const data = await get(url, { type: 'json', lang, headers: { referer: `${base}/q/${encodeURIComponent(query)}/` } });
      const items = (data?.listings || []).map((l) => {
        const p = l.priceInfo || {};
        let priceAmount = null;
        if (p.priceType === 'FREE') priceAmount = 0;
        else if (p.priceCents > 0) priceAmount = p.priceCents / 100;
        const pic = l.pictures?.[0];
        let image = pic?.mediumUrl || pic?.largeUrl || l.imageUrls?.[0] || null;
        if (image?.startsWith('//')) image = 'https:' + image;
        return {
          id: `${id}:${l.itemId}`,
          title: l.title || '',
          description: l.description || l.categorySpecificDescription || '',
          priceText: priceAmount != null ? `€ ${priceAmount}` : (p.priceType || ''),
          priceAmount,
          negotiable: ['MIN_BID', 'FAST_BID', 'SEE_DESCRIPTION', 'NOTK'].includes(p.priceType),
          currency: 'EUR',
          url: l.vipUrl?.startsWith('http') ? l.vipUrl : base + (l.vipUrl || `/${l.itemId}`),
          image,
          location: [l.location?.cityName, l.location?.countryAbbreviation].filter(Boolean).join(', '),
          postedAt: l.date || null,
        };
      });
      return { items };
    },

    // «123x bekeken» / «vues» на сторінці оголошення
    async details(item) {
      const html = await get(item.url, { lang });
      const patterns = [/"viewCount"\s*:\s*(\d+)/, /"views"\s*:\s*(\d+)/, /(\d[\d.]*)\s*x\s*bekeken/i, /(\d[\d.]*)\s*keer\s*bekeken/i, /bekeken[^\d<]{0,20}(\d[\d.]*)/i, /(\d[\d.]*)\s*(?:fois\s*)?vues?\b/i];
      for (const re of patterns) {
        const m = html.match(re);
        if (m) return { views: Number(m[1].replace(/\./g, '')) };
      }
      const i = html.search(/bekeken|vues?\b|viewCount/i);
      return { views: null, raw: i >= 0 ? html.slice(Math.max(0, i - 200), i + 200).replace(/\s+/g, ' ') : `len=${html.length}` };
    },
  };
}

export const marktplaats = makeSource({ id: 'marktplaats', name: 'Marktplaats', flag: '🇳🇱', base: 'https://www.marktplaats.nl', lang: 'nl-NL,nl;q=0.9' });
export const tweedehands = makeSource({ id: '2dehands', name: '2dehands', flag: '🇧🇪', base: 'https://www.2dehands.be', lang: 'nl-BE,nl;q=0.9' });
