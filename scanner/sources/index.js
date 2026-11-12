import kleinanzeigen from './kleinanzeigen.js';
import willhaben from './willhaben.js';
import ebay from './ebay.js';
import subito from './subito.js';
import wallapop from './wallapop.js';
import leboncoin from './leboncoin.js';
import { marktplaats, tweedehands } from './marktplaats.js';
import { olxPl, olxUa, olxRo, olxPt, olxBg } from './olx.js';
import { bazosSk, bazosCz, bazosPl, bazosAt } from './bazos.js';
import tutti from './tutti.js';

export const SOURCES = Object.fromEntries(
  [kleinanzeigen, willhaben, marktplaats, tweedehands, subito, wallapop, leboncoin, bazosSk, bazosCz, bazosPl, bazosAt, tutti, olxRo, olxPt, olxBg, olxPl, ebay, olxUa].map((s) => [s.id, s]),
);
