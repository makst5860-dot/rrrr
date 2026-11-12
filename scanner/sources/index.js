import kleinanzeigen from './kleinanzeigen.js';
import willhaben from './willhaben.js';
import ebay from './ebay.js';
import subito from './subito.js';
import wallapop from './wallapop.js';
import leboncoin from './leboncoin.js';
import { marktplaats, tweedehands } from './marktplaats.js';
import { olxPl, olxUa, olxRo, olxPt, olxBg } from './olx.js';
import { bazosSk, bazosCz } from './bazos.js';

export const SOURCES = Object.fromEntries(
  [kleinanzeigen, willhaben, marktplaats, tweedehands, subito, wallapop, leboncoin, bazosSk, bazosCz, olxRo, olxPt, olxBg, olxPl, ebay, olxUa].map((s) => [s.id, s]),
);
