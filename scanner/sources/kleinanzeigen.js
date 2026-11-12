// Kleinanzeigen.de (Німеччина) — розбір HTML сторінки пошуку (розмітка 2026: article[data-adid]).
import * as cheerio from 'cheerio';
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://www.kleinanzeigen.de';
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const PRICE_RE = /€|\bVB\b|verschenken|tausch/i;

export default {
  id: 'kleinanzeigen',
  name: 'Kleinanzeigen',
  flag: '🇩🇪',
  async search(query, { maxPrice }) {
    const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, '-'));
    const html = await get(`${BASE}/s-preis::${maxPrice}/${slug}/k0`);
    const $ = cheerio.load(html);
    const items = [];
    $('article[data-adid]').each((_, el) => {
      const $el = $(el);
      const adId = $el.attr('data-adid');
      const href = $el.attr('data-href') || $el.find('a[href*="/s-anzeige/"]').first().attr('href');
      if (!adId || !href) return;

      let ld = {};
      try { ld = JSON.parse($el.find('script[type="application/ld+json"]').first().text() || '{}'); } catch { /* ignore */ }

      const $title = $el.find('h3 a, h2 a, a.ellipsis').first();
      const title = clean($title.text()) || clean(ld.title || ld.name);
      const priceText = clean(
        $el.find('p').filter((_, p) => PRICE_RE.test($(p).text()) && $(p).text().length < 40).first().text()
        || $el.find('[class*="price"]').first().text(),
      );
      const spans = $el.find('span').map((_, s) => clean($(s).text())).get();
      const location = spans.find((t) => /^\d{5}\s+\S/.test(t)) || clean($el.find('.aditem-main--top--left').text());
      const postedText = spans.find((t) => /^(\d{2}\.\d{2}\.\d{4}|Heute|Gestern)/.test(t)) || '';
      const img = $el.find('img').first();

      items.push({
        id: `ka:${adId}`,
        title,
        description: clean($title.closest('h3, h2').next('p').text()) || clean(ld.description).slice(0, 300),
        priceText,
        priceAmount: parsePrice(priceText),
        currency: 'EUR',
        url: href.startsWith('http') ? href : BASE + href,
        image: ld.contentUrl || img.attr('src') || img.attr('data-src') || null,
        location,
        postedText,
      });
    });
    const blocked = items.length === 0 && /captcha|zugriff verweigert|access denied/i.test(html);
    const sample = items.length ? '' : `len=${html.length} article=${(html.match(/<article/g) || []).length} adid=${(html.match(/data-adid/g) || []).length} ${clean(html.slice(0, 300))}`;
    return { items, blocked, sample };
  },

  // Лічильник переглядів (той самий, що показує сторінка оголошення; запит додає +1 перегляд)
  async details(item) {
    const adId = item.id.split(':')[1];
    const data = await get(`${BASE}/s-vac-inc-get.json?adId=${adId}`, {
      type: 'json',
      retries: 1,
      headers: { referer: item.url, 'x-requested-with': 'XMLHttpRequest' },
    });
    const n = Number(data?.numVisits ?? data?.numVisitsStr);
    return { views: Number.isFinite(n) ? n : null, raw: JSON.stringify(data).slice(0, 200) };
  },
};
