// Bazoš (Словаччина, Чехія) — простий HTML; кількість переглядів видно прямо в результатах пошуку.
import * as cheerio from 'cheerio';
import { get } from '../lib/http.js';
import { parsePrice } from '../lib/price.js';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

function makeSource({ id, name, flag, base, currency, lang }) {
  return {
    id,
    name,
    flag,
    async search(query) {
      const html = await get(`${base}/search.php?hledat=${encodeURIComponent(query)}&rubriky=www&hlokalita=&humkreis=&cenaod=&cenado=&order=&kitx=ano`, { lang });
      const $ = cheerio.load(html);
      const items = [];
      $('div.inzeraty').each((_, el) => {
        const $el = $(el);
        const a = $el.find('h2 a, .nadpis a').first();
        const href = a.attr('href') || '';
        const adId = href.match(/\/(?:inzerat|ogloszenie|anzeige|inserat|[a-z]+)\/(\d{5,})\//)?.[1];
        if (!adId) return;
        const priceText = clean($el.find('.inzeratycena').text());
        const viewsText = clean($el.find('.inzeratyview').text());
        const dateM = clean($el.text()).match(/\[(\d{1,2})\.(\d{1,2})\.\s?(\d{4})\]/);
        const img = $el.find('img').first();
        items.push({
          id: `${id}:${adId}`,
          title: clean(a.text()),
          description: clean($el.find('.popis').text()).slice(0, 400),
          priceText,
          priceAmount: parsePrice(priceText),
          currency: /kč|czk/i.test(priceText) ? 'CZK' : /zł|pln/i.test(priceText) ? 'PLN' : /€|eur/i.test(priceText) ? 'EUR' : currency,
          negotiable: /dohodou|dohoda|v texte|v textu|do negocjacji|negocj|vb|verhandl/i.test(priceText),
          url: href.startsWith('http') ? href : base + href,
          image: img.attr('src') || null,
          location: clean($el.find('.inzeratylok').text()),
          views: /\d/.test(viewsText) ? Number(viewsText.replace(/\D/g, '')) : null,
          postedAt: dateM ? new Date(Date.UTC(+dateM[3], +dateM[2] - 1, +dateM[1])).toISOString() : null,
        });
      });
      return { items, sample: items.length ? '' : `len=${html.length} inzeraty=${(html.match(/inzeraty/g) || []).length} ${clean(html.slice(0, 200))}` };
    },
  };
}

export const bazosSk = makeSource({ id: 'bazos-sk', name: 'Bazoš.sk', flag: '🇸🇰', base: 'https://www.bazos.sk', currency: 'EUR', lang: 'sk-SK,sk;q=0.9' });
export const bazosCz = makeSource({ id: 'bazos-cz', name: 'Bazoš.cz', flag: '🇨🇿', base: 'https://www.bazos.cz', currency: 'CZK', lang: 'cs-CZ,cs;q=0.9' });
export const bazosPl = makeSource({ id: 'bazos-pl', name: 'Bazoš.pl', flag: '🇵🇱', base: 'https://www.bazos.pl', currency: 'PLN', lang: 'pl-PL,pl;q=0.9' });
export const bazosAt = makeSource({ id: 'bazos-at', name: 'Bazoš.at', flag: '🇦🇹', base: 'https://www.bazos.at', currency: 'EUR', lang: 'de-AT,de;q=0.9' });
