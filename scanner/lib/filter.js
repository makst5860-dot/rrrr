// Чи справді оголошення — це тістоміс Kemper/Diosna, а не гітарний підсилювач Kemper чи запчастина.
export function buildMatcher(config) {
  const mixerRe = new RegExp(config.mixerWords, 'i');
  const excludeRe = new RegExp(config.excludeWords, 'i');
  const wantedRe = new RegExp(config.wantedWords, 'i');
  const brands = config.brands.map((b) => ({ ...b, re: new RegExp(b.match, 'i') }));

  return function classify(item) {
    const title = String(item.title || '').toLowerCase();
    const desc = String(item.description || '').toLowerCase();
    const all = `${title} ${desc}`;
    if (!title) return { ok: false, reason: 'без назви' };
    if (wantedRe.test(title)) return { ok: false, reason: 'куплю/шукаю' };
    if (excludeRe.test(title)) return { ok: false, reason: 'виключене слово' };

    for (const brand of brands) {
      if (brand.re.test(title)) {
        if (brand.requireMixerWord && !mixerRe.test(all)) continue;
        return { ok: true, brand: brand.name };
      }
    }
    // марка тільки в описі — тоді в назві мусить бути, що це тістоміс
    for (const brand of brands) {
      if (brand.re.test(desc) && mixerRe.test(title)) return { ok: true, brand: brand.name };
    }
    return { ok: false, reason: 'не та марка / не тістоміс' };
  };
}

export function priceOk(item, config) {
  if (item.priceEur == null) return Boolean(config.includeNoPrice);
  return item.priceEur >= (config.minPriceEur ?? 0) && item.priceEur <= config.maxPriceEur;
}

// «VB», «Verhandlungsbasis», «Bieden» тощо — ціна договірна, а не конкретна
export function isNegotiable(item, config) {
  if (item.negotiable) return true;
  const re = new RegExp(config.negotiableWords, 'i');
  return re.test(`${item.priceText || ''} ${item.title || ''}`);
}

// Коли оголошення зʼявилось: ISO-дата або «Heute, 10:12» / «Gestern» / «10.11.2026»
export function postedDate(item, now = new Date()) {
  const iso = item.postedAt && Date.parse(item.postedAt);
  if (iso) return new Date(iso);
  const t = String(item.postedText || '').trim();
  if (/^heute/i.test(t)) return now;
  if (/^gestern/i.test(t)) return new Date(now.getTime() - 86400_000);
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
