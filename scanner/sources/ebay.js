// eBay.de — розбір HTML (підтримує стару s-item і нову s-card розмітку).
import * as cheerio from 'cheerio';
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export default {
  id: 'ebay-de',
  name: 'eBay',
  flag: '🇩🇪',
  async search(query, { maxPrice }) {
    const url = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query)}&_udhi=${maxPrice}&_sop=10&_ipg=60`;
    const html = await get(url);
    const $ = cheerio.load(html);
    const items = [];
    $('li.s-item, li.s-card, li[data-listingid]').each((_, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/itm/"]').first().attr('href') || '';
      const idMatch = link.match(/\/itm\/(?:[^/?]+\/)?(\d{9,})/) || [null, $el.attr('data-listingid')];
      const itemId = idMatch[1];
      if (!itemId) return;
      let title = clean($el.find('.s-item__title, .s-card__title').first().text());
      title = title.replace(/^(Neues Angebot|Neu eingestellt)\s*/i, '').replace(/Wird in neuem Fenster oder Tab geöffnet$/i, '').trim();
      if (!title || /^shop on ebay$/i.test(title)) return;
      const priceText = clean($el.find('.s-item__price, .s-card__price').first().text());
      const img = $el.find('img').first();
      items.push({
        id: `eb:${itemId}`,
        title,
        description: clean($el.find('.s-item__subtitle, .s-card__subtitle').text()),
        priceText,
        priceAmount: parsePrice(priceText),
        currency: 'EUR',
        url: `https://www.ebay.de/itm/${itemId}`,
        image: img.attr('src') || img.attr('data-src') || null,
        location: clean($el.find('.s-item__location, .s-card__attribute-row:contains("aus ")').first().text()).replace(/^aus\s+/i, ''),
      });
    });
    const blocked = items.length === 0 && /pardon our interruption|captcha|ungewöhnliche aktivität/i.test(html);
    return { items, blocked, sample: html };
  },
};
