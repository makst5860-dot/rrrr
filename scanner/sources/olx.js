// OLX (Польща, Україна) — публічний JSON API.
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

function makeSource({ id, name, flag, base, currency, lang }) {
  return {
    id,
    name,
    flag,
    async search(query) {
      const url = `${base}/api/v1/offers/?offset=0&limit=50&query=${encodeURIComponent(query)}&sort_by=created_at%3Adesc`;
      const data = await get(url, { type: 'json', lang });
      const items = (data?.data || []).map((o) => {
        const priceParam = (o.params || []).find((p) => p.key === 'price');
        const v = priceParam?.value || {};
        let priceAmount = null;
        if (v.type === 'free' || /darmo|безкоштовно|даром/i.test(v.label || '')) priceAmount = 0;
        else if (typeof v.value === 'number' && v.value > 0) priceAmount = v.value;
        else priceAmount = parsePrice(v.label);
        const photo = o.photos?.[0]?.link;
        return {
          id: `${id}:${o.id}`,
          title: o.title || '',
          description: String(o.description || '').replace(/<[^>]+>/g, ' ').slice(0, 600),
          priceText: v.label || '',
          priceAmount,
          currency: v.currency || currency,
          url: o.url,
          image: photo ? photo.replace('{width}', '400').replace('{height}', '300') : null,
          location: [o.location?.city?.name, o.location?.region?.name].filter(Boolean).join(', '),
          postedAt: o.created_time || o.last_refresh_time || null,
        };
      });
      return { items };
    },
  };
}

export const olxPl = makeSource({ id: 'olx-pl', name: 'OLX.pl', flag: '🇵🇱', base: 'https://www.olx.pl', currency: 'PLN', lang: 'pl-PL,pl;q=0.9' });
export const olxUa = makeSource({ id: 'olx-ua', name: 'OLX.ua', flag: '🇺🇦', base: 'https://www.olx.ua', currency: 'UAH', lang: 'uk-UA,uk;q=0.9' });
