// Курси валют до євро (скільки одиниць валюти за 1 €).
import { get } from './http.js';

const FALLBACK = { EUR: 1, PLN: 4.25, UAH: 48, USD: 1.08, CHF: 0.93, CZK: 25, HUF: 395, RON: 5.0, BGN: 1.96 };

export async function loadRates() {
  try {
    const data = await get('https://open.er-api.com/v6/latest/EUR', { type: 'json', retries: 1 });
    if (data?.rates?.PLN) return { ...FALLBACK, ...data.rates, EUR: 1 };
  } catch { /* використаємо запасні курси */ }
  return { ...FALLBACK };
}

export function toEur(amount, currency, rates) {
  if (amount == null) return null;
  const cur = (currency || 'EUR').toUpperCase().replace('ZŁ', 'PLN').replace('ГРН', 'UAH').replace('$', 'USD');
  const rate = rates[cur];
  if (!rate) return null;
  return Math.round(amount / rate);
}
