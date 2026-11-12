// Тістоміс-радар: шукає Kemper / Diosna до N € на кількох сайтах і шле сповіщення лише про нові оголошення.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources/index.js';
import { buildMatcher, priceOk, isNegotiable, postedDate } from './lib/filter.js';
import { loadRates, toEur } from './lib/fx.js';
import { jitter, shuffle } from './lib/http.js';
import { makeNotifier, messageFor, summaryMessage, formatEur } from './lib/notify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  config: join(ROOT, 'config.json'),
  seen: join(ROOT, 'data/seen.json'),
  listings: join(ROOT, 'data/listings.json'),
  status: join(ROOT, 'data/status.json'),
};

const DEBUG = /^(1|true|yes)$/i.test(process.env.DEBUG || '');
const TEST_PUSH = /^(1|true|yes)$/i.test(process.env.TEST_PUSH || '');
const log = (...a) => console.log(...a);

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}
async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 1) + '\n');
}

async function scanSource(source, queries, ctx) {
  const res = { items: [], ok: 0, errors: [], blocked: false };
  for (const [i, q] of shuffle(queries).entries()) {
    if (i > 0) await jitter(2000, 5000); // випадкові паузи між запитами
    try {
      const out = await source.search(q, ctx);
      res.ok++;
      if (out.blocked) res.blocked = true;
      res.items.push(...out.items);
      if (DEBUG) {
        log(`  [${source.id}] «${q}»: ${out.items.length} оголошень${out.blocked ? ' (схоже на блокування)' : ''}`);
        if (!out.items.length && out.sample) log(`     html: ${out.sample.replace(/\s+/g, ' ').slice(0, 9000)}`);
      }
    } catch (err) {
      res.errors.push(`«${q}»: ${err.message}`);
      if (DEBUG) log(`  [${source.id}] «${q}»: ПОМИЛКА ${err.message} ${err.body ? err.body.replace(/\s+/g, ' ').slice(0, 200) : ''}`);
    }
  }
  return res;
}

async function main() {
  const startedAt = new Date();
  const nowIso = startedAt.toISOString();
  const today = nowIso.slice(0, 10);
  const config = await readJson(P.config, null);
  if (!config) throw new Error('config.json не знайдено');

  const classify = buildMatcher(config);
  const rates = await loadRates();
  const seenState = await readJson(P.seen, { seen: {}, initializedSources: [] });
  const listings = await readJson(P.listings, { items: [] });
  const prevStatus = await readJson(P.status, null);

  const notifier = makeNotifier({ ntfyTopic: process.env.NTFY_TOPIC, log });
  log(`Сповіщення: ${notifier.enabled ? 'ntfy ✓' : 'НЕ налаштовані — додай секрет NTFY_TOPIC'}`);

  if (TEST_PUSH) {
    const n = await notifier.send({
      title: '✅ Тістоміс-радар працює',
      message: 'Так виглядатиме сповіщення про новий тістоміс Kemper або Diosna до 1500 €.',
      priority: 5,
      tags: ['bread'],
    });
    log(`Тестове сповіщення: ${n ? 'надіслано' : 'не надіслано'}`);
    // приклад зі справжнім оголошенням із журналу — щоб було видно фото і посилання
    const example = [...listings.items].sort((a, b) => (a.priceEur ?? 1e9) - (b.priceEur ?? 1e9))[0];
    if (example) {
      const src = SOURCES[example.source] || {};
      const msg = messageFor({ ...example, flag: src.flag || '', sourceName: src.name || example.source });
      await notifier.send({ ...msg, title: `Приклад · ${msg.title}`, priority: 4 });
      log(`Приклад надіслано: ${example.title}`);
    }
  }

  // ---- пошук (сайти паралельно, запити до одного сайту — послідовно з випадковими паузами)
  const enabled = Object.entries(config.sources).filter(([id, s]) => s.enabled && SOURCES[id]);
  const ctx = { maxPrice: config.maxPriceEur };
  const results = await Promise.all(enabled.map(async ([id, s]) => [id, await scanSource(SOURCES[id], s.queries, ctx)]));

  const status = { checkedAt: nowIso, maxPriceEur: config.maxPriceEur, sources: {} };
  const matched = new Map();
  for (const [id, r] of results) {
    const src = SOURCES[id];
    let relevant = 0;
    const checked = new Set();
    for (const raw of r.items) {
      if (matched.has(raw.id) || checked.has(raw.id)) continue;
      checked.add(raw.id);
      const verdict = classify(raw);
      const item = {
        ...raw,
        source: id,
        sourceName: src.name,
        flag: src.flag,
        priceEur: raw.currency === 'EUR' ? (raw.priceAmount == null ? null : Math.round(raw.priceAmount)) : toEur(raw.priceAmount, raw.currency, rates),
      };
      if (!verdict.ok) {
        if (DEBUG && verdict.reason !== 'не та марка / не тістоміс') log(`     – ${id} ${item.title.slice(0, 70)} → ${verdict.reason}`);
        continue;
      }
      item.brand = verdict.brand;
      if (!priceOk(item, config)) {
        if (DEBUG) log(`     – ${id} ${item.title.slice(0, 70)} → ціна ${item.priceText || '—'}`);
        continue;
      }
      if (!config.allowNegotiable && isNegotiable(item, config)) {
        if (DEBUG) log(`     – ${id} ${item.title.slice(0, 70)} → договірна ціна (${item.priceText || '—'})`);
        continue;
      }
      relevant++;
      matched.set(item.id, item);
      if (DEBUG) log(`     ✓ ${id} ${item.brand} ${formatEur(item.priceEur)} ${item.title.slice(0, 70)} ${item.url}`);
    }
    status.sources[id] = {
      name: src.name,
      ok: r.ok > 0 && !r.blocked,
      found: r.items.length,
      matched: relevant,
      error: r.errors[0] || (r.blocked ? 'сайт блокує запити' : null),
    };
    log(`${src.flag} ${src.name.padEnd(14)} запитів ок ${r.ok}/${config.sources[id].queries.length}, знайдено ${r.items.length}, підходить ${relevant}${r.errors.length ? `, помилки: ${r.errors.join('; ')}` : ''}`);
  }

  // ---- що нового (перший запуск кожного сайту — без сповіщень, щоб не засипати старими оголошеннями)
  const initialized = new Set(seenState.initializedSources || []);
  const fresh = [];
  for (const item of matched.values()) {
    if (seenState.seen[item.id]) continue;
    seenState.seen[item.id] = nowIso;
    if (initialized.has(item.source)) fresh.push(item);
  }
  const newlyInitialized = [];
  for (const [id, r] of results) {
    if (!initialized.has(id) && r.ok > 0 && !r.blocked) { initialized.add(id); newlyInitialized.push(id); }
  }
  seenState.initializedSources = [...initialized];
  if (newlyInitialized.length) log(`Перший запуск для: ${newlyInitialized.join(', ')} — наявні оголошення збережено без сповіщень.`);

  // ---- журнал знайденого (data/listings.json)
  const byId = new Map(listings.items.map((i) => [i.id, i]));
  let changed = false;
  for (const item of matched.values()) {
    const prev = byId.get(item.id);
    const next = {
      id: item.id, source: item.source, brand: item.brand, title: item.title, priceEur: item.priceEur,
      priceText: item.priceText, url: item.url, image: item.image || null, location: item.location || '',
      firstSeen: prev?.firstSeen || nowIso, lastSeen: today,
    };
    if (!prev || prev.priceEur !== next.priceEur || prev.lastSeen !== next.lastSeen || prev.title !== next.title) changed = true;
    byId.set(item.id, next);
  }
  const cutoff = Date.now() - config.keepDays * 86400_000;
  for (const [id, it] of byId) {
    if (new Date(it.lastSeen).getTime() < cutoff) { byId.delete(id); changed = true; }
  }
  for (const [id, ts] of Object.entries(seenState.seen)) {
    if (Date.now() - new Date(ts).getTime() > 180 * 86400_000) delete seenState.seen[id];
  }
  const items = [...byId.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  // ---- свіжість: мало переглядів (або, якщо перегляди не видно, — оголошення не старіше N днів)
  async function freshness(item) {
    const src = SOURCES[item.source];
    if (src.details) {
      try {
        const d = await src.details(item);
        if (d.views != null) item.views = d.views;
        if (DEBUG && d.views == null) log(`     ? перегляди ${item.id}: ${d.raw || '—'}`);
      } catch (err) {
        if (DEBUG) log(`     ? перегляди ${item.id}: ПОМИЛКА ${err.message}`);
      }
    }
    if (item.views != null) return item.views <= config.maxViews ? null : `багато переглядів (${item.views})`;
    const posted = postedDate(item);
    if (posted && Date.now() - posted.getTime() > config.maxAgeDaysIfNoViews * 86400_000) return `старе оголошення (${item.postedText || item.postedAt})`;
    return null;
  }

  if (DEBUG) {
    log('\nПеревірка лічильника переглядів (по 2 оголошення з кожного сайту):');
    const bySource = {};
    for (const item of matched.values()) (bySource[item.source] ||= []).push(item);
    for (const list of Object.values(bySource)) {
      for (const item of list.slice(0, 2)) {
        const why = await freshness(item);
        log(`  👁 ${item.source} ${item.views ?? '?'} переглядів — ${item.title.slice(0, 50)} → ${why || 'ок'}`);
      }
    }
  }

  const accepted = [];
  for (const item of fresh) {
    const why = await freshness(item);
    if (why) log(`  ✗ ${item.brand} ${formatEur(item.priceEur)} — ${item.title}: ${why}`);
    else accepted.push(item);
    await jitter(800, 2000);
  }
  for (const item of accepted) {
    const rec = byId.get(item.id);
    if (rec && item.views != null) rec.views = item.views;
  }
  fresh.length = 0;
  fresh.push(...accepted);

  // ---- сповіщення
  log(`\nНових оголошень: ${fresh.length}`);
  fresh.sort((a, b) => (a.priceEur ?? 1e9) - (b.priceEur ?? 1e9));
  if (fresh.length && !DEBUG && notifier.enabled) {
    const individual = fresh.slice(0, config.maxIndividualNotifications);
    for (const item of individual) {
      const n = await notifier.send(messageFor(item));
      log(`  🔔 ${item.brand} ${formatEur(item.priceEur)} — ${item.title}${n ? '' : ' (НЕ доставлено)'}`);
    }
    const rest = fresh.length - individual.length;
    if (rest > 0) await notifier.send(summaryMessage(rest));
  } else {
    for (const item of fresh) log(`  • ${item.brand} ${formatEur(item.priceEur)} — ${item.title} ${item.url}`);
  }

  if (DEBUG) { log('\nDEBUG: файли не змінюються, сповіщення не надсилаються.'); return; }

  // ---- збереження (статус — не частіше ніж раз на 6 год, якщо більше нічого не змінилось)
  const healthSig = (st) => JSON.stringify(Object.entries(st?.sources || {}).map(([k, v]) => [k, v.ok]));
  const statusStale = !prevStatus || Date.now() - new Date(prevStatus.checkedAt).getTime() > 6 * 3600_000;
  status.totals = { listings: items.length, newThisRun: fresh.length };

  if (changed || fresh.length) await writeJson(P.listings, { updatedAt: nowIso, maxPriceEur: config.maxPriceEur, items });
  if (changed || fresh.length || newlyInitialized.length || statusStale || healthSig(prevStatus) !== healthSig(status)) {
    await writeJson(P.status, status);
    await writeJson(P.seen, seenState);
  }
  log(`Готово за ${Math.round((Date.now() - startedAt.getTime()) / 1000)} с. У журналі ${items.length} оголошень.`);
}

main().catch((err) => {
  console.error('Помилка:', err);
  process.exit(1);
});
