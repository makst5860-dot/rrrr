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
  return item.priceEur <= config.maxPriceEur;
}
