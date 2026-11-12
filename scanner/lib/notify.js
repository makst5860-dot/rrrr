// Надсилання сповіщень: Web Push у застосунок на iPhone + (необовʼязково) ntfy.
import webpush from 'web-push';

const BRAND_UK = { Kemper: 'Кемпер', Diosna: 'Діосна' };
const SOURCE_UK = {
  kleinanzeigen: 'Кляйнанцайґен',
  willhaben: 'Вільгабен',
  marktplaats: 'Марктплатс',
  '2dehands': 'Тведеандс',
  'olx-pl': 'О-Ел-Ікс Польща',
  'olx-ua': 'О-Ел-Ікс Україна',
  'ebay-de': 'Ібей',
};

export const formatEur = (n) => (n == null ? 'ціна не вказана' : `${Math.round(n).toLocaleString('uk-UA').replace(/ /g, ' ')} €`);

export function speechText(item) {
  const brand = BRAND_UK[item.brand] || item.brand;
  const price = item.priceEur == null ? 'ціна не вказана' : item.priceEur === 0 ? 'безкоштовно' : `ціна ${item.priceEur} євро`;
  const src = SOURCE_UK[item.source] || item.sourceName;
  return `Новий тістоміс ${brand}. ${price[0].toUpperCase()}${price.slice(1)}. ${src}.`;
}

export function messageFor(item, appUrl) {
  return {
    id: item.id,
    title: `🥖 ${item.brand}: ${formatEur(item.priceEur)}`,
    body: `${item.title}\n${item.flag} ${item.sourceName}${item.location ? ' · ' + item.location : ''}`,
    url: `${appUrl}?open=${encodeURIComponent(item.id)}`,
    listingUrl: item.url,
    speak: speechText(item),
  };
}

export function summaryMessage(count, appUrl, text) {
  return {
    id: null,
    title: `🥖 Тістоміси: ${count} нових`,
    body: text,
    url: appUrl,
    speak: `Знайдено ${count} нових тістомісів.`,
  };
}

function parseSubscriptions(raw) {
  if (!raw || !raw.trim()) return [];
  const t = raw.trim();
  try {
    const parsed = JSON.parse(t);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((s) => s?.endpoint);
  } catch {
    // кілька підписок, кожна з нового рядка
    return t.split(/\n+/).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((s) => s?.endpoint);
  }
}

export function makeNotifier({ vapidPublicKey, vapidPrivateKey, subject, subscriptionsRaw, ntfyTopic, ntfyServer = 'https://ntfy.sh', log = console.log }) {
  const subs = parseSubscriptions(subscriptionsRaw);
  const pushReady = Boolean(vapidPublicKey && vapidPrivateKey && subs.length);
  if (pushReady) webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey);

  const channels = [];
  if (pushReady) channels.push(`web-push (${subs.length} пристр.)`);
  if (ntfyTopic) channels.push('ntfy');

  async function send(msg) {
    let delivered = 0;
    if (pushReady) {
      const payload = JSON.stringify(msg);
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub, payload, { TTL: 12 * 3600, urgency: 'high' });
          delivered++;
        } catch (err) {
          const hint = err.statusCode === 404 || err.statusCode === 410 ? ' — підписка застаріла, онови PUSH_SUBSCRIPTIONS' : '';
          log(`  ✗ push → ${new URL(sub.endpoint).host}: ${err.statusCode || ''} ${err.body || err.message}${hint}`);
        }
      }
    }
    if (ntfyTopic) {
      try {
        const res = await fetch(ntfyServer, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            topic: ntfyTopic,
            title: msg.title.replace(/^🥖\s*/, ''),
            message: msg.body,
            click: msg.listingUrl || msg.url,
            tags: ['bread'],
            priority: 5,
          }),
        });
        if (res.ok) delivered++;
        else log(`  ✗ ntfy: HTTP ${res.status}`);
      } catch (err) {
        log(`  ✗ ntfy: ${err.message}`);
      }
    }
    return delivered;
  }

  return { channels, send, enabled: channels.length > 0 };
}
