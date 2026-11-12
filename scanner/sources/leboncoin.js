// leboncoin.fr (Франція) — дані зі сторінки пошуку (__NEXT_DATA__). Сайт часто блокує роботів.
import { get } from '../lib/http.js';
import { nextData, findArray } from './nextdata.js';

export default {
  id: 'leboncoin',
  name: 'leboncoin',
  flag: '🇫🇷',
  async search(query) {
    const html = await get(`https://www.leboncoin.fr/recherche?text=${encodeURIComponent(query)}&sort=time&order=desc`, { lang: 'fr-FR,fr;q=0.9' });
    const data = nextData(html);
    const list = findArray(data, (x) => x && x.list_id && x.subject) || [];
    const items = list.filter((ad) => ad?.list_id).map((ad) => ({
      id: `leboncoin:${ad.list_id}`,
      title: ad.subject || '',
      description: String(ad.body || '').slice(0, 400),
      priceText: ad.price?.[0] != null ? `${ad.price[0]} €` : '',
      priceAmount: ad.price?.[0] ?? (ad.price_cents ? ad.price_cents / 100 : null),
      currency: 'EUR',
      url: ad.url || `https://www.leboncoin.fr/ad/${ad.list_id}`,
      image: ad.images?.urls?.[0] || ad.images?.thumb_url || null,
      location: [ad.location?.zipcode, ad.location?.city].filter(Boolean).join(' '),
      postedAt: ad.first_publication_date ? ad.first_publication_date.replace(' ', 'T') : null,
    }));
    return { items, blocked: !data, sample: items.length ? '' : `len=${html.length} ${html.slice(0, 200)}` };
  },
};
