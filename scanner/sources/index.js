import kleinanzeigen from './kleinanzeigen.js';
import willhaben from './willhaben.js';
import ebay from './ebay.js';
import { marktplaats, tweedehands } from './marktplaats.js';
import { olxPl, olxUa } from './olx.js';

export const SOURCES = Object.fromEntries(
  [kleinanzeigen, willhaben, marktplaats, tweedehands, olxPl, ebay, olxUa].map((s) => [s.id, s]),
);
