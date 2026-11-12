// Сповіщення на iPhone через застосунок ntfy (безкоштовний, App Store).
export const formatEur = (n) => (n == null ? 'ціна не вказана' : n === 0 ? 'безкоштовно' : `${Math.round(n).toLocaleString('uk-UA').replace(/\s/g, ' ')} €`);

const httpUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : undefined);

export function messageFor(item) {
  return {
    title: `${item.brand} · ${formatEur(item.priceEur)}`,
    message: `${item.title}\n${item.flag} ${item.sourceName}${item.location ? ' · ' + item.location : ''}`,
    click: httpUrl(item.url),
    attach: httpUrl(item.image),
    priority: 5,
    tags: ['bread'],
    actions: httpUrl(item.url) ? [{ action: 'view', label: 'Відкрити оголошення', url: item.url, clear: true }] : undefined,
  };
}

export function summaryMessage(count) {
  return {
    title: `Ще ${count} нових тістомісів`,
    message: 'Забагато за один раз — список у репозиторії: data/listings.json',
    priority: 4,
    tags: ['bread'],
  };
}

export function makeNotifier({ ntfyTopic, ntfyServer = 'https://ntfy.sh', log = console.log }) {
  const topic = (ntfyTopic || '').trim();
  async function send(msg) {
    if (!topic) return 0;
    try {
      const res = await fetch(ntfyServer, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, ...msg }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return 1;
      log(`  ✗ ntfy: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      log(`  ✗ ntfy: ${err.message}`);
    }
    return 0;
  }
  return { enabled: Boolean(topic), send };
}
