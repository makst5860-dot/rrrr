// Wallapop (Іспанія) — JSON API.
import { get } from '../lib/http.js';
import { findArray } from './nextdata.js';

export default {
  id: 'wallapop',
  name: 'Wallapop',
  flag: '🇪🇸',
  async search(query) {
    const url = `https://api.wallapop.com/api/v3/search?source=search_box&keywords=${encodeURIComponent(query)}&order_by=newest&latitude=40.41956&longitude=-3.69196`;
    const data = await get(url, {
      type: 'json',
      lang: 'es-ES,es;q=0.9',
      headers: { 'x-deviceos': '0', origin: 'https://es.wallapop.com', referer: 'https://es.wallapop.com/' },
    });
    const list = findArray(data, (x) => x && x.web_slug) || [];
    const items = list.filter((it) => it?.web_slug).map((it) => {
      const amount = typeof it.price === 'object' ? it.price?.amount : it.price;
      return {
        id: `wallapop:${it.id}`,
        title: it.title || '',
        description: String(it.description || '').slice(0, 400),
        priceText: amount != null ? `${amount} ${it.price?.currency || it.currency || 'EUR'}` : '',
        priceAmount: amount != null ? Number(amount) : null,
        currency: it.price?.currency || it.currency || 'EUR',
        url: `https://es.wallapop.com/item/${it.web_slug}`,
        image: it.images?.[0]?.urls?.medium || it.images?.[0]?.urls?.small || null,
        location: [it.location?.city, it.location?.region].filter(Boolean).join(', '),
        postedAt: it.created_at ? new Date(it.created_at).toISOString() : null,
      };
    });
    return { items, sample: items.length ? '' : JSON.stringify(data).slice(0, 300) };
  },
};
