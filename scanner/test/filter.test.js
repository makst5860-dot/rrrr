import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatcher, priceOk } from '../lib/filter.js';
import { parsePrice } from '../lib/price.js';
import { toEur } from '../lib/fx.js';

const config = JSON.parse(readFileSync(new URL('../../config.json', import.meta.url)));
const classify = buildMatcher(config);
const ok = (title, description = '') => classify({ title, description });

test('ціни', () => {
  assert.equal(parsePrice('1.200 € VB'), 1200);
  assert.equal(parsePrice('€ 1.250,-'), 1250);
  assert.equal(parsePrice('950 €'), 950);
  assert.equal(parsePrice('1 450,50 €'), 1450);
  assert.equal(parsePrice('4 500 zł'), 4500);
  assert.equal(parsePrice('Zu verschenken'), 0);
  assert.equal(parsePrice('VB'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(toEur(4250, 'PLN', { PLN: 4.25 }), 1000);
});

test('підходять справжні тістоміси', () => {
  assert.deepEqual(ok('Diosna SP 24 Spiralkneter'), { ok: true, brand: 'Diosna' });
  assert.deepEqual(ok('DIOSNA SP12 F'), { ok: true, brand: 'Diosna' });
  assert.deepEqual(ok('Kemper SP 25 Spiralkneter 400V'), { ok: true, brand: 'Kemper' });
  assert.deepEqual(ok('Kemper SP15', 'Teigmenge 15 kg'), { ok: true, brand: 'Kemper' });
  assert.deepEqual(ok('Teigknetmaschine Spiralkneter 25kg', 'Marke Kemper, läuft einwandfrei'), { ok: true, brand: 'Kemper' });
  assert.deepEqual(ok('Kemper deegmenger'), { ok: true, brand: 'Kemper' });
  assert.deepEqual(ok('Miesiarka spiralna Diosna'), { ok: true, brand: 'Diosna' });
  assert.deepEqual(ok('Тістоміс Kemper'), { ok: true, brand: 'Kemper' });
});

test('відсіюємо зайве', () => {
  assert.equal(ok('Kemper Profiler Stage').ok, false);
  assert.equal(ok('Kemper Amp Remote').ok, false);
  assert.equal(ok('Kemper Ventil DN 20').ok, false);
  assert.equal(ok('Suche Diosna Spiralkneter').ok, false);
  assert.equal(ok('Ankauf Bäckereimaschinen Diosna Kemper').ok, false);
  assert.equal(ok('Kemper Teigteiler Rotomat').ok, false);
  assert.equal(ok('Diosna Ersatzteil Riemen').ok, false);
  assert.equal(ok('Spiralkneter 25 kg').ok, false);
  assert.equal(ok('Spiralkneter 25 kg', 'Marke Sottoriva').ok, false);
});

test('ліміт ціни', () => {
  assert.equal(priceOk({ priceEur: 1500 }, config), true);
  assert.equal(priceOk({ priceEur: 1501 }, config), false);
  assert.equal(priceOk({ priceEur: 0 }, config), true);
  assert.equal(priceOk({ priceEur: null }, config), false);
});

test('запчастини з Kleinanzeigen відсіюються', () => {
  assert.equal(ok('Seitliches Rad Diosna Spiralkneter Kesselwagen 120-240 NEU').ok, false);
  assert.equal(ok('Vorderes Rad Diosna Spiralkneter Kesselwagen 120-240 NEU').ok, false);
  assert.equal(ok('Diosna 120 Hubkneter, Knetarm').ok, false);
  assert.equal(ok('Antriebszahnrad Kunststoff 55mm Türkischer Abwieger Teigteil NEU').ok, false);
  assert.equal(ok('Schalter passend für Diosna SP 24').ok, false);
  assert.deepEqual(ok('Diosna SP 24 Spiralkneter 400V gebraucht'), { ok: true, brand: 'Diosna' });
});

test('реальні випадки з Kleinanzeigen (12.11.2026)', () => {
  const no = [
    'Zeitschaltuhr / Steuerung Knetmaschine Kemper',
    'Knetmaschine, IBIS/Vitalback,Spiralkneter,Kneter MS 340 n.Kemper',
    'Reibrad Bandage Kemper Spiralkneter ausfahrbar SP 75a - SP 150a',
    'Reibrad Bandage Diosna Spiralkneter ausfahrbar 160-240 Kneter NEU',
    'Wendelkneter, Knetmaschine, IBIS / Vitalback MK 340 (n. Diosna)',
    'Teigkneter Hubkneter 2 Gang Eberhardt (kein Kemper, Diosna)',
    'Elektromotor Bottichantrieb Kemper Kneter',
    'Kemper Kneter Zeitrelais',
    'Arretier- Messingbolzen Kemper Spiralkneter Kesselwagen SP125-150',
    'Knethaken Kemper SP30',
    'Aufnahme für Diosna Kemper Hebekipper Bäckerei',
  ];
  for (const t of no) assert.equal(ok(t).ok, false, t);
  const yes = [
    ['Spiralkneter Kemper', 'Kemper'],
    ['Diosna SP200D Knetmaschine,Spiralkneter, Top Zustand', 'Diosna'],
    ['DIOSNA (Boku) RS 40 CS Planetrührmaschine', 'Diosna'],
    ['Diosna S120 2G Hubkneter Hubknetmaschine Teigkneter', 'Diosna'],
    ['Diosna Hubkneter SP120', 'Diosna'],
    ['Hubknetmaschine von Diosna 120 kg', 'Diosna'],
    ['Diosna S120 armkneder - Professionele deegmachine', 'Diosna'],
    ['Diosna SP 24 Spiralkneter mit neuem Motor', 'Diosna'],
  ];
  for (const [t, brand] of yes) assert.deepEqual(ok(t), { ok: true, brand }, t);
});
