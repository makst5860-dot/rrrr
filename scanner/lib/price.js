// Розбір цін у форматах «1.200 € VB», «€ 1.250,-», «1 200 zł», «Zu verschenken» тощо.
const FREE_RE = /zu verschenken|gratis|kostenlos|za darmo|безкоштовно|даром|\bfree\b/i;

export function parsePrice(text) {
  if (text == null) return null;
  const s = String(text).replace(/ | /g, ' ').trim();
  if (!s) return null;
  if (FREE_RE.test(s)) return 0;
  // число з розділювачами тисяч (крапка, пробіл, апостроф) і необовʼязковими копійками
  const m = s.match(/(\d{1,3}(?:[.\s'’]\d{3})+|\d+)(?:,(\d{1,2}|-{1,2}))?(?:\.(\d{1,2}))?/);
  if (!m) return null;
  const whole = m[1].replace(/[.\s'’]/g, '');
  const n = Number(whole);
  return Number.isFinite(n) ? n : null;
}
