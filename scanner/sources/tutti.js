// tutti.ch (Швейцарія) — дані зі сторінки пошуку (__NEXT_DATA__), ціни у франках.
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';
import { nextData, findArray } from './nextdata.js';

export default {
  id: 'tutti',
  name: 'tutti.ch',
  flag: '🇨🇭',
  async search(query) {
    const html = await get(`https://www.tutti.ch/de/q/suche?query=${encodeURIComponent(query)}&sorting=newest`, { lang: 'de-CH,de;q=0.9' });
    const data = nextData(html);
    const list = findArray(data, (x) => x && (x.listingID || x.listingId) && x.title) || [];
    const items = list.filter((x) => x && (x.listingID || x.listingId)).map((x) => {
      const id = x.listingID || x.listingId;
      const priceText = x.formattedPrice || x.price || '';
      const slug = x.seoInformation?.deSlug || x.seoInformation?.slug || 'inserat';
      return {
        id: `tutti:${id}`,
        title: x.title || '',
        description: String(x.body || x.description || '').slice(0, 400),
        priceText: String(priceText),
        priceAmount: parsePrice(priceText),
        currency: 'CHF',
        negotiable: /vb|verhandl|auf anfrage/i.test(String(priceText)),
        url: `https://www.tutti.ch/de/vi/${slug}/${id}`,
        image: x.thumbnail?.normalRendition?.src || x.images?.[0]?.rendition?.src || null,
        location: [x.postcodeInformation?.postcode, x.postcodeInformation?.locationName].filter(Boolean).join(' '),
        postedAt: x.timestamp || null,
      };
    });
    return { items, blocked: !data, sample: items.length ? '' : `len=${html.length} next=${Boolean(data)} keys=${data ? Object.keys(data.props?.pageProps || {}).join(',') : ''}` };
  },
};
