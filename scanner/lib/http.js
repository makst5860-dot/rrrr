// Мережеві запити з «людською» поведінкою: різні User-Agent, повтори, випадкові паузи.
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const randomBetween = (min, max) => min + Math.random() * (max - min);
export const jitter = (minMs, maxMs) => sleep(randomBetween(minMs, maxMs));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

export class HttpError extends Error {
  constructor(status, url, body = '') {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function get(url, { type = 'text', headers = {}, retries = 2, lang = 'de-DE,de;q=0.9,en;q=0.7' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
        headers: {
          'user-agent': ua,
          'accept-language': lang,
          accept: type === 'json' ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
      });
      const body = await res.text();
      if (!res.ok) throw new HttpError(res.status, url, body.slice(0, 300));
      return type === 'json' ? JSON.parse(body) : body;
    } catch (err) {
      lastErr = err;
      // 4xx (крім 429) повторювати немає сенсу
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) break;
      if (attempt < retries) await jitter(3000, 8000);
    }
  }
  throw lastErr;
}
