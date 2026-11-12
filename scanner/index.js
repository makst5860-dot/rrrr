// Тістоміс-радар: шукає Kemper / Diosna до N € на кількох сайтах, зберігає нові й шле сповіщення.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources/index.js';
import { buildMatcher, priceOk } from './lib/filter.js';
import { loadRates, toEur } from './lib/fx.js';
import { jitter, shuffle } from './lib/http.js';
import { makeNotifier, messageFor, summaryMessage, formatEur } from './lib/notify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  config: join(ROOT, 'config.json'),
  seen: join(ROOT, 'data/seen.json'),
  listings: join(ROOT, 'docs/data/listings.json'),
  status: join(ROOT, 'docs/data/status.json'),
  appConfig: join(ROOT, 'docs/config.js'),
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

function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'owner/repo').split('/');
  return `https://${owner.toLowerCase()}.github.io/${repo}/`;
}

async function vapidPublicKey() {
  if (process.env.VAPID_PUBLIC_KEY) return process.env.VAPID_PUBLIC_KEY;
  const js = await readFile(P.appConfig, 'utf8').catch(() => '');
  return js.match(/vapidPublicKey:\s*['"]([^'"]+)['"]/)?.[1] || '';
}

async function scanSource(source, queries, ctx) {
  const res = { items: [], ok: 0, errors: [], blocked: false };
  for (const [i, q] of shuffle(queries).entries()) {
    if (i > 0) await jitter(2500, 7000); // випадкові паузи між запитами
    try {
      const out = await source.search(q, ctx);
      res.ok++;
      if (out.blocked) res.blocked = true;
      res.items.push(...out.items);
      if (DEBUG) {
        log(`  [${source.id}] «${q}»: ${out.items.length} оголошень${out.blocked ? ' (схоже на блокування)' : ''}`);
        if (!out.items.length && out.sample) log(`     html: ${out.sample.replace(/\s+/g, ' ').slice(0, 400)}`);
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

  const notifier = makeNotifier({
    vapidPublicKey: await vapidPublicKey(),
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || appUrl(),
    subscriptionsRaw: process.env.PUSH_SUBSCRIPTIONS,
    ntfyTopic: process.env.NTFY_TOPIC,
    log,
  });
  log(`Сповіщення: ${notifier.enabled ? notifier.channels.join(', ') : 'не налаштовані (додай секрети VAPID_PRIVATE_KEY + PUSH_SUBSCRIPTIONS)'}`);

  if (TEST_PUSH) {
    const n = await notifier.send({
      id: null,
      title: '✅ Тест: сповіщення працюють',
      body: 'Так виглядатиме повідомлення про новий тістоміс Kemper / Diosna.',
      url: appUrl(),
      speak: 'Тестове сповіщення. Усе працює.',
    });
    log(`Тестове сповіщення доставлено: ${n}`);
  }

  // ---- пошук на всіх сайтах (сайти паралельно, запити до одного сайту — послідовно з паузами)
  const enabled = Object.entries(config.sources).filter(([id, s]) => s.enabled && SOURCES[id]);
  const ctx = { maxPrice: config.maxPriceEur };
  const results = await Promise.all(enabled.map(async ([id, s]) => [id, await scanSource(SOURCES[id], s.queries, ctx)]));

  const status = { checkedAt: nowIso, maxPriceEur: config.maxPriceEur, sources: {} };
  const matched = new Map();
  for (const [id, r] of results) {
    const src = SOURCES[id];
    let relevant = 0;
    for (const raw of r.items) {
      if (matched.has(raw.id)) continue;
      const verdict = classify(raw);
      const item = {
        ...raw,
        source: id,
        sourceName: src.name,
        flag: src.flag,
        priceEur: raw.currency === 'EUR' ? (raw.priceAmount == null ? null : Math.round(raw.priceAmount)) : toEur(raw.priceAmount, raw.currency, rates),
      };
      if (!verdict.ok) {
        if (DEBUG) log(`     – ${id} ${item.title.slice(0, 70)} → ${verdict.reason}`);
        continue;
      }
      item.brand = verdict.brand;
      if (!priceOk(item, config)) {
        if (DEBUG) log(`     – ${id} ${item.title.slice(0, 70)} → ціна ${item.priceText || '—'}`);
        continue;
      }
      relevant++;
      matched.set(item.id, item);
      if (DEBUG) log(`     ✓ ${id} ${item.brand} ${formatEur(item.priceEur)} ${item.title.slice(0, 70)}`);
    }
    status.sources[id] = {
      name: src.name,
      flag: src.flag,
      ok: r.ok > 0 && !r.blocked,
      queries: s(config.sources[id].queries.length, r.ok),
      found: r.items.length,
      matched: relevant,
      error: r.errors[0] || (r.blocked ? 'сайт блокує запити' : null),
    };
    log(`${src.flag} ${src.name.padEnd(14)} запитів ок ${r.ok}/${config.sources[id].queries.length}, знайдено ${r.items.length}, підходить ${relevant}${r.errors.length ? `, помилки: ${r.errors.join('; ')}` : ''}`);
  }

  // ---- що нового
  const initialized = new Set(seenState.initializedSources || []);
  const fresh = [];
  for (const item of matched.values()) {
    if (seenState.seen[item.id]) continue;
    seenState.seen[item.id] = nowIso;
    if (initialized.has(item.source)) fresh.push(item);
  }
  const silentlyInitialized = [];
  for (const [id, r] of results) {
    if (!initialized.has(id) && r.ok > 0) { initialized.add(id); silentlyInitialized.push(id); }
  }
  seenState.initializedSources = [...initialized];
  if (silentlyInitialized.length) log(`Перший запуск для: ${silentlyInitialized.join(', ')} — наявні оголошення збережено без сповіщень.`);

  // ---- оновлюємо список для застосунку
  const byId = new Map(listings.items.map((i) => [i.id, i]));
  let changed = false;
  for (const item of matched.values()) {
    const prev = byId.get(item.id);
    const description = String(item.description || '').slice(0, 280);
    const next = {
      id: item.id, source: item.source, sourceName: item.sourceName, flag: item.flag, brand: item.brand,
      title: item.title, description, priceEur: item.priceEur, priceText: item.priceText, currency: item.currency,
      url: item.url, image: item.image || null, location: item.location || '', postedAt: item.postedAt || item.postedText || null,
      firstSeen: prev?.firstSeen || nowIso, lastSeen: today,
    };
    if (!prev) { if (!fresh.includes(item)) next.initial = true; }
    else if (prev.initial) next.initial = true;
    if (!prev || prev.priceEur !== next.priceEur || prev.lastSeen !== next.lastSeen || prev.title !== next.title) changed = true;
    byId.set(item.id, next);
  }
  const cutoff = Date.now() - config.keepDays * 86400_000;
  for (const [id, it] of byId) {
    if (new Date(it.lastSeen).getTime() < cutoff) { byId.delete(id); changed = true; }
  }
  // «бачені» id тримаємо пів року, щоб повторно не сповіщати про ті самі оголошення
  for (const [id, ts] of Object.entries(seenState.seen)) {
    if (Date.now() - new Date(ts).getTime() > 180 * 86400_000) delete seenState.seen[id];
  }
  const items = [...byId.values()].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  // ---- сповіщення
  log(`\nНових оголошень: ${fresh.length}`);
  if (fresh.length && !DEBUG && notifier.enabled) {
    fresh.sort((a, b) => (a.priceEur ?? 1e9) - (b.priceEur ?? 1e9));
    const individual = fresh.slice(0, config.maxIndividualNotifications);
    for (const item of individual) {
      const n = await notifier.send(messageFor(item, appUrl()));
      log(`  🔔 ${item.brand} ${formatEur(item.priceEur)} — ${item.title} (${n} доставлено)`);
    }
    const rest = fresh.length - individual.length;
    if (rest > 0) await notifier.send(summaryMessage(rest, appUrl(), `Ще ${rest} оголошень — відкрий застосунок.`));
  } else if (fresh.length) {
    for (const item of fresh) log(`  • ${item.brand} ${formatEur(item.priceEur)} — ${item.title} ${item.url}`);
  }

  if (DEBUG) { log('\nDEBUG: файли не змінюються, сповіщення не надсилаються.'); return; }

  // ---- збереження (статус комітимо не частіше ніж раз на 3 год, якщо нічого не змінилось)
  const healthSig = (st) => JSON.stringify(Object.entries(st?.sources || {}).map(([k, v]) => [k, v.ok]));
  const statusStale = !prevStatus || Date.now() - new Date(prevStatus.checkedAt).getTime() > 3 * 3600_000;
  status.totals = { listings: items.length, newThisRun: fresh.length };
  status.durationSec = Math.round((Date.now() - startedAt.getTime()) / 1000);

  if (changed || fresh.length) await writeJson(P.listings, { updatedAt: nowIso, maxPriceEur: config.maxPriceEur, items });
  if (changed || fresh.length || silentlyInitialized.length || statusStale || healthSig(prevStatus) !== healthSig(status)) {
    await writeJson(P.status, status);
    await writeJson(P.seen, seenState);
  }
  log(`Готово за ${status.durationSec} с. У списку ${items.length} оголошень.`);
}

function s(total, ok) { return `${ok}/${total}`; }

main().catch((err) => {
  console.error('Помилка:', err);
  process.exit(1);
});
