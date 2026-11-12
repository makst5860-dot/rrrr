// Subito.it (Італія) — дані зі сторінки пошуку (__NEXT_DATA__).
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { nextData, findArray } from './nextdata.js';

export default {
  id: 'subito',
  name: 'Subito',
  flag: '🇮🇹',
  async search(query) {
    const html = await get(`https://www.subito.it/annunci-italia/vendita/usato/?q=${encodeURIComponent(query)}&order=datedesc`, { lang: 'it-IT,it;q=0.9' });
    const data = nextData(html);
    const list = findArray(data, (x) => x && (x.item?.subject || x.subject)) || [];
    const items = list.map((x) => x.item || x).filter((it) => it?.subject).map((it) => {
      const priceRaw = it.features?.['/price']?.values?.[0];
      const priceText = priceRaw?.value || priceRaw?.key || '';
      const img = it.images?.[0];
      return {
        id: `subito:${String(it.urn || it.id || it.urls?.default).replace(/\D+/g, '').slice(0, 14) || it.urls?.default}`,
        title: it.subject,
        description: String(it.body || '').slice(0, 400),
        priceText,
        priceAmount: priceRaw?.key != null ? Number(priceRaw.key) || parsePrice(priceText) : parsePrice(priceText),
        currency: 'EUR',
        url: it.urls?.default,
        image: img?.cdnBaseUrl ? `${img.cdnBaseUrl}?rule=card-mobile-new-small-1x-auto` : img?.scale?.[0]?.uri || null,
        location: [it.geo?.town?.value, it.geo?.city?.shortName].filter(Boolean).join(', '),
        postedAt: it.date ? it.date.replace(' ', 'T') : null,
      };
    });
    return { items, blocked: !data, sample: items.length ? '' : `len=${html.length} next=${Boolean(data)} ${html.slice(0, 200)}` };
  },
};
