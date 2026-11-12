// Service worker: офлайн-кеш, push-сповіщення, відкриття оголошення по тапу.
const CACHE = 'radar-v1';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'radar-push').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  // дані — завжди свіжі з мережі, кеш лише як запасний варіант
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname)),
    );
    return;
  }
  // оболонка застосунку — з кешу, оновлюється у фоні
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Тістоміс-радар', body: event.data?.text() || '' }; }
  const title = data.title || 'Новий тістоміс';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: data.id || 'radar-summary',
      renotify: true,
      data,
    });
    // зберігаємо останні сповіщення: сайт оновлюється на хвилину пізніше, ніж приходить push
    if (data.id) {
      try {
        const key = new URL('push-log.json', self.registration.scope).href;
        const cache = await caches.open('radar-push');
        const prev = await cache.match(key).then((r) => (r ? r.json() : [])).catch(() => []);
        const log = [{ ...data, at: Date.now() }, ...prev.filter((x) => x.id !== data.id)].slice(0, 30);
        await cache.put(key, new Response(JSON.stringify(log), { headers: { 'content-type': 'application/json' } }));
      } catch { /* не критично */ }
    }
    // якщо застосунок відкритий — нехай одразу озвучить
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) w.postMessage({ type: 'push', data });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || './', self.registration.scope);
  // відкриваємо застосунок (у межах scope) — там картка оголошення з кнопками «Відкрити» і «Озвучити»
  if (target.origin !== location.origin) target.href = new URL(`./?open=${encodeURIComponent(data.id || '')}`, self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        w.postMessage({ type: 'open', id: data.id || null });
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
