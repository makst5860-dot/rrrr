// Тістоміс-радар — клієнтська частина (PWA для iPhone).
const CFG = window.RADAR_CONFIG || {};
const $ = (sel) => document.querySelector(sel);

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватний режим — не страшно */ }
  },
};

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const BRAND_UK = { Kemper: 'Кемпер', Diosna: 'Діосна' };
const SOURCE_UK = {
  kleinanzeigen: 'Кляйнанцайґен', willhaben: 'Вільгабен', marktplaats: 'Марктплатс', '2dehands': 'Тведеандс',
  'olx-pl': 'О-Ел-Ікс Польща', 'olx-ua': 'О-Ел-Ікс Україна', 'ebay-de': 'Ібей',
};
const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#9C8670" stroke-width="3" stroke-linecap="round"><path d="M32 6v16"/><path d="M32 22c7 1 7 7 0 8s-7 7 0 8"/><path d="M10 36h44c0 12-9 20-22 20S10 48 10 36z"/></svg>',
);

const state = {
  items: [],
  status: null,
  brand: store.get('brand', 'all'),
  maxPrice: store.get('maxPrice', 1500),
  sort: store.get('sort', 'new'),
  voice: store.get('voice', false),
  prevVisit: store.get('lastVisit', 0),
  known: null,          // id, які вже показані в цій сесії
  freshIds: new Set(),  // нові з моменту відкриття
  spoken: new Set(),
  pinnedId: new URLSearchParams(location.search).get('open'),
};

// ---------------------------------------------------------------- форматування
const nf = new Intl.NumberFormat('uk-UA');
const eur = (n) => (n == null ? 'ціна ?' : n === 0 ? 'безкоштовно' : `${nf.format(n)} €`);
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'щойно';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} хв тому`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.round(h / 24)} дн. тому`;
}
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function toast(text, ms = 3200) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------------------------------------------------------- озвучка
let voices = [];
const loadVoices = () => { voices = window.speechSynthesis?.getVoices() || []; };
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'uk-UA';
  const v = voices.find((x) => /^uk/i.test(x.lang));
  if (v) u.voice = v;
  u.rate = 1;
  speechSynthesis.speak(u);
}

function speechFor(item) {
  const price = item.priceEur == null ? 'Ціна не вказана' : item.priceEur === 0 ? 'Безкоштовно' : `Ціна ${item.priceEur} євро`;
  return `Тістоміс ${BRAND_UK[item.brand] || item.brand}. ${price}. ${SOURCE_UK[item.source] || item.sourceName}.`;
}

// iOS дозволяє говорити тільки після дотику користувача — «розблоковуємо» мовлення першим дотиком
let speechPrimed = false;
function primeSpeech() {
  if (speechPrimed || !('speechSynthesis' in window)) return;
  speechPrimed = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}
document.addEventListener('pointerdown', primeSpeech, { once: true, capture: true });

function renderVoice() {
  const b = $('#voice-btn');
  b.setAttribute('aria-pressed', String(state.voice));
  $('#voice-label').textContent = state.voice ? 'Озвучка увімк.' : 'Озвучка';
}
$('#voice-btn').addEventListener('click', () => {
  state.voice = !state.voice;
  store.set('voice', state.voice);
  renderVoice();
  if (state.voice) speak('Озвучку увімкнено. Я зачитуватиму нові тістоміси.');
  else window.speechSynthesis?.cancel();
});

// ---------------------------------------------------------------- дані
async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function loadData({ announce = false } = {}) {
  try {
    const [listings, status] = await Promise.all([
      fetchJson('data/listings.json'),
      fetchJson('data/status.json').catch(() => null),
    ]);
    const items = listings.items || [];
    if (state.known === null) {
      state.known = new Set(items.map((i) => i.id));
    } else {
      const fresh = items.filter((i) => !state.known.has(i.id));
      for (const i of fresh) { state.known.add(i.id); state.freshIds.add(i.id); }
      if (announce && fresh.length) onFresh(fresh);
    }
    state.items = items;
    state.status = status;
    if (listings.maxPriceEur) $('#sub-price').textContent = listings.maxPriceEur;
    render();
    renderSources();
  } catch (err) {
    $('#robot-text').textContent = 'Не вдалося завантажити дані. Перевір інтернет.';
  }
}

function onFresh(fresh) {
  const first = fresh[0];
  toast(fresh.length === 1 ? `Новий тістоміс: ${first.brand} · ${eur(first.priceEur)}` : `Нових оголошень: ${fresh.length}`);
  if (state.voice) {
    for (const i of fresh.slice(0, 5)) {
      if (state.spoken.has(i.id)) continue;
      state.spoken.add(i.id);
      speak(`Новий ${speechFor(i).charAt(0).toLowerCase()}${speechFor(i).slice(1)}`);
    }
  }
  requestAnimationFrame(() => {
    for (const i of fresh) document.getElementById(`it-${CSS.escape(i.id)}`)?.classList.add('flash');
  });
}

// ---------------------------------------------------------------- статус робота
async function loadRobot() {
  const box = $('#robot');
  const text = $('#robot-text');
  const total = state.items.length;
  const tail = total ? ` · ${total} оголош.` : '';
  let run = null;
  if (CFG.repo) {
    try {
      const r = await fetch(`https://api.github.com/repos/${CFG.repo}/actions/workflows/${CFG.workflowFile || 'scan.yml'}/runs?per_page=1`, { cache: 'no-store' });
      if (r.ok) run = (await r.json()).workflow_runs?.[0] || null;
    } catch { /* ліміт API або офлайн */ }
  }
  box.classList.remove('ok', 'warn');
  if (run && run.status !== 'completed') {
    box.classList.add('ok');
    text.textContent = `Робот зараз перевіряє сайти…${tail}`;
    return;
  }
  const when = run?.updated_at || state.status?.checkedAt;
  if (!when) { text.textContent = 'Робот ще не запускався.'; return; }
  const ageMin = (Date.now() - new Date(when).getTime()) / 60000;
  if (run && run.conclusion && run.conclusion !== 'success') {
    box.classList.add('warn');
    text.textContent = `Остання перевірка з помилкою, ${ago(when)}${tail}`;
  } else if (ageMin > 120) {
    box.classList.add('warn');
    text.textContent = `Робот давно не перевіряв (${ago(when)})${tail}`;
  } else {
    box.classList.add('ok');
    text.textContent = `Робот перевірив ${ago(when)}${tail}`;
  }
}

function renderSources() {
  const ul = $('#sources');
  ul.replaceChildren();
  const sources = state.status?.sources || {};
  for (const s of Object.values(sources)) {
    ul.append(el('li', { class: s.ok ? 'ok' : 'err', title: s.error || `знайдено ${s.found}, підходить ${s.matched}`, text: `${s.flag} ${s.name}${s.ok ? '' : ' — помилка'}` }));
  }
  if (!ul.children.length) ul.append(el('li', { text: 'Kleinanzeigen · willhaben · Marktplaats · 2dehands · OLX · eBay' }));
}

// ---------------------------------------------------------------- список
function isNewBadge(item) {
  if (state.freshIds.has(item.id)) return true;
  if (item.initial || !state.prevVisit) return false;
  return new Date(item.firstSeen).getTime() > state.prevVisit;
}
const isStale = (item) => Date.now() - new Date(item.lastSeen).getTime() > 2.5 * 86400_000;

function card(item) {
  const href = safeUrl(item.url);
  const img = safeUrl(item.image);
  const fresh = isNewBadge(item);
  const stale = isStale(item);
  const thumb = el('div', { class: 'thumb' },
    img
      ? el('img', { src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => { e.target.replaceWith(el('img', { class: 'ph', src: PLACEHOLDER, alt: '' })); } })
      : el('img', { class: 'ph', src: PLACEHOLDER, alt: '' }));
  const body = el('div', { class: 'body' },
    el('div', { class: 'line1' },
      el('span', { class: `price${item.priceEur === 0 ? ' free' : ''}`, text: eur(item.priceEur) }),
      el('span', { class: 'brand-tag', text: item.brand }),
      fresh ? el('span', { class: 'badge', text: 'нове' }) : null,
      stale ? el('span', { class: 'badge muted', text: 'можливо продано' }) : null),
    el('h3', { class: 'title', text: item.title }),
    el('div', { class: 'meta', text: `${item.flag} ${item.sourceName}${item.location ? ' · ' + item.location : ''}` }),
    el('div', { class: 'meta', text: `знайдено ${ago(item.firstSeen)}` }));
  const speakBtn = el('button', { class: 'speak', type: 'button', 'aria-label': 'Озвучити оголошення', onclick: () => speak(speechFor(item)) });
  speakBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  return el('li', { class: `card${fresh ? ' is-new' : ''}${stale ? ' stale' : ''}`, id: `it-${item.id}` },
    href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${item.title}, ${eur(item.priceEur)}` }) : null,
    thumb, body, speakBtn);
}

function render() {
  const list = state.items
    .filter((i) => state.brand === 'all' || i.brand === state.brand)
    .filter((i) => i.priceEur == null || i.priceEur <= state.maxPrice)
    .sort(state.sort === 'cheap'
      ? (a, b) => (a.priceEur ?? 1e9) - (b.priceEur ?? 1e9)
      : (a, b) => b.firstSeen.localeCompare(a.firstSeen));
  $('#list').replaceChildren(...list.map(card));
  $('#empty').hidden = list.length > 0;
  const newCount = list.filter(isNewBadge).length;
  $('#count').textContent = list.length ? `${list.length} оголош.${newCount ? ` · ${newCount} нових` : ''}` : '';
  for (const b of document.querySelectorAll('#brand-seg button')) b.setAttribute('aria-checked', String(b.dataset.v === state.brand));
  $('#price-select').value = String(state.maxPrice);
  $('#sort-select').value = state.sort;
  renderPinned();
}

for (const b of document.querySelectorAll('#brand-seg button')) {
  b.addEventListener('click', () => { state.brand = b.dataset.v; store.set('brand', state.brand); render(); });
}
$('#price-select').addEventListener('change', (e) => { state.maxPrice = Number(e.target.value); store.set('maxPrice', state.maxPrice); render(); });
$('#sort-select').addEventListener('change', (e) => { state.sort = e.target.value; store.set('sort', state.sort); render(); });

// ---------------------------------------------------------------- закріплене оголошення (тап по сповіщенню)
async function pushLog() {
  try {
    const res = await caches.match(new URL('push-log.json', location.href).href);
    return res ? await res.json() : [];
  } catch { return []; }
}

async function renderPinned() {
  const box = $('#pinned');
  if (!state.pinnedId) { box.hidden = true; return; }
  const item = state.items.find((i) => i.id === state.pinnedId);
  let title, sub, href, speech;
  if (item) {
    title = `${item.brand} · ${eur(item.priceEur)}`;
    sub = `${item.title} — ${item.flag} ${item.sourceName}${item.location ? ', ' + item.location : ''}`;
    href = safeUrl(item.url);
    speech = speechFor(item);
  } else {
    // сповіщення приходить раніше, ніж оновлюється сайт — беремо дані з самого сповіщення
    const p = (await pushLog()).find((x) => x.id === state.pinnedId);
    if (!p) { box.hidden = true; return; }
    title = p.title.replace(/^🥖\s*/, '');
    sub = p.body.replace(/\n/g, ' — ');
    href = safeUrl(p.listingUrl);
    speech = p.speak;
  }
  box.replaceChildren(
    el('p', { class: 'label', text: 'Зі сповіщення' }),
    el('h2', { text: title }),
    el('p', { text: sub }),
    el('div', { class: 'row' },
      href ? el('a', { class: 'btn primary', href, target: '_blank', rel: 'noopener noreferrer', text: 'Відкрити оголошення' }) : null,
      el('button', { class: 'btn', type: 'button', text: '🔊 Прослухати', onclick: () => speak(speech) }),
      el('button', { class: 'btn ghost', type: 'button', text: 'Закрити', onclick: () => { state.pinnedId = null; history.replaceState(null, '', location.pathname); box.hidden = true; } })));
  box.hidden = false;
}

// ---------------------------------------------------------------- push-сповіщення
function b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function renderSetup() {
  const setup = $('#setup');
  const show = (id) => { for (const s of setup.querySelectorAll('.step')) s.hidden = s.id !== id; setup.hidden = !id; };
  if (store.get('setupDone', false)) { show(null); return; }
  if ((isIOS && !isStandalone) || !pushSupported) { show('setup-install'); return; }
  const sub = Notification.permission === 'granted' ? await currentSubscription() : null;
  if (!sub) { show('setup-permission'); return; }
  $('#sub-code').value = JSON.stringify(sub);
  $('#secrets-link').href = `https://github.com/${CFG.repo}/settings/secrets/actions/new`;
  show('setup-code');
}

$('#push-btn').addEventListener('click', async () => {
  const errBox = $('#push-error');
  errBox.hidden = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Сповіщення заборонені. Дозволь їх: Параметри → Сповіщення → Тістоміси.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(CFG.vapidPublicKey) });
    await renderSetup();
    toast('Сповіщення дозволено ✅');
  } catch (err) {
    errBox.textContent = err.message || String(err);
    errBox.hidden = false;
  }
});

$('#copy-btn').addEventListener('click', async () => {
  const code = $('#sub-code').value;
  try { await navigator.clipboard.writeText(code); } catch { $('#sub-code').select(); document.execCommand('copy'); }
  toast('Код скопійовано — встав його в секрет PUSH_SUBSCRIPTIONS');
});

$('#test-btn').addEventListener('click', async () => {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('🥖 Diosna: 1 200 € (тест)', { body: 'Так виглядатиме сповіщення про новий тістоміс', icon: 'icons/icon-192.png', tag: 'test' });
  speak('Тістоміс Діосна. Ціна тисяча двісті євро. Тест.');
});

$('#done-btn').addEventListener('click', () => { store.set('setupDone', true); renderSetup(); });
$('#reset-setup').addEventListener('click', () => { store.set('setupDone', false); renderSetup(); $('#setup').scrollIntoView({ behavior: 'smooth' }); });

// ---------------------------------------------------------------- service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'push') {
      const d = msg.data || {};
      if (state.voice && d.speak && !state.spoken.has(d.id)) { state.spoken.add(d.id); speak(d.speak); }
      toast(d.title || 'Нове оголошення');
      setTimeout(() => loadData({ announce: true }), 90_000); // сайт оновиться приблизно за хвилину
    }
    if (msg.type === 'open' && msg.id) {
      state.pinnedId = msg.id;
      renderPinned();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

// ---------------------------------------------------------------- перевірка у випадковий час, поки застосунок відкритий
function scheduleRefresh() {
  clearTimeout(scheduleRefresh.timer);
  const delay = 75_000 + Math.random() * 125_000; // 1¼–3¼ хв
  scheduleRefresh.timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') {
      await loadData({ announce: true });
      loadRobot();
    }
    scheduleRefresh();
  }, delay);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    store.set('lastVisit', Date.now());
  } else {
    loadData({ announce: true }).then(loadRobot);
    renderSetup();
  }
});
window.addEventListener('pagehide', () => store.set('lastVisit', Date.now()));

renderVoice();
renderSetup();
loadData().then(loadRobot);
scheduleRefresh();
