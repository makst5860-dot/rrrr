// Kleinanzeigen.de (Німеччина) — розбір HTML сторінки пошуку.
import * as cheerio from 'cheerio';
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const BASE = 'https://www.kleinanzeigen.de';
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// для DEBUG: коротко показуємо, як виглядає сторінка, якщо оголошення не знайшлися
function diagnose(html) {
  const out = [`len=${html.length}`, `aditem=${(html.match(/aditem/g) || []).length}`, `adid=${(html.match(/adid/gi) || []).length}`];
  const snip = (re, picks, before, after) => {
    const idx = [...html.matchAll(re)].map((m) => m.index);
    for (const n of picks) if (idx[n] != null) out.push(`<<${re.source}#${n}@${idx[n]}: ${html.slice(Math.max(0, idx[n] - before), idx[n] + after)}>>`);
  };
  snip(/adid/gi, [0, 1, 12], 300, 500);
  snip(/\/s-anzeige\//g, [10, 25], 600, 900);
  return out.join(' | ');
}

export default {
  id: 'kleinanzeigen',
  name: 'Kleinanzeigen',
  flag: '🇩🇪',
  async search(query, { maxPrice }) {
    const slug = encodeURIComponent(query.trim().toLowerCase().replace(/\s+/g, '-'));
    const html = await get(`${BASE}/s-preis::${maxPrice}/${slug}/k0`);
    const $ = cheerio.load(html);
    const items = [];
    $('article.aditem, li.ad-listitem article').each((_, el) => {
      const $el = $(el);
      const adId = $el.attr('data-adid');
      const href = $el.attr('data-href') || $el.find('a[href*="/s-anzeige/"]').first().attr('href');
      if (!adId || !href) return;
      const priceText = clean($el.find('[class*="price-shipping--price"], .aditem-main--middle--price').first().text());
      const img = $el.find('img').first();
      items.push({
        id: `ka:${adId}`,
        title: clean($el.find('h2 a, a.ellipsis, .text-module-begin').first().text()),
        description: clean($el.find('.aditem-main--middle--description').text()),
        priceText,
        priceAmount: parsePrice(priceText),
        currency: 'EUR',
        url: href.startsWith('http') ? href : BASE + href,
        image: img.attr('src') || img.attr('data-src') || $el.find('[data-imgsrc]').attr('data-imgsrc') || null,
        location: clean($el.find('.aditem-main--top--left').text()),
        postedText: clean($el.find('.aditem-main--top--right').text()),
      });
    });
    return { items, blocked: items.length === 0 && /captcha|zugriff verweigert|access denied/i.test(html), sample: items.length ? '' : diagnose(html) };
  },
};
