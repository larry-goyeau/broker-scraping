// Minerva Holding Financial Securities (嬴控金融證券, formerly Power
// Securities, SFC-licensed, Hong Kong) sells online through its app
// (嬴財富通) and web trading. Its own "Standard Commission and Charges
// Table" prices Hong Kong trades only: "Commission Negotiable 0.25% on
// Transaction Amount (min HKD 100.00)", with the HKEX, SFC, AFRC and CCASS
// charges. The table prints no list and no exception, so the Hong Kong
// place is the whole HKEX book (../primehk/hkexBook.mjs through
// ../bocomhk/hkCatalogue.mjs: shares, REITs and exchange-traded products;
// HKD, USD and RMB counters each on their own code; suspended and
// never-traded lines left out).
//
// United States: broker-list.json gives Minerva a US place, and the app's
// user manual (a white-label platform manual, the broker-list source)
// shows US quotes and a US share account type. But no page or document of
// Minerva prices a US trade, so the US is left out: no published fee.
//
//   https://www.minervasec.hk/open-account/charge-table  (Charge Table PDF)
//   https://www.minervasec.hk/download/247f9572-f4c7-4bfa-b6e6-b01956ae5130  (user manual)
//
// Fees: "Commission Negotiable 0.25% on Transaction Amount (min HKD
// 100.00)" (a ceiling at the broker's discretion: take 0.25%).
//   https://www.minervasec.hk/download/dbe87ef3-7e17-4ec8-9c5b-20e372fe20d6
//
//   node brokers/minerva/minerva_scraping.mjs

import { hkCatalogue } from "../bocomhk/hkCatalogue.mjs";
import { pdfSays } from "../alphasec/pdfSays.mjs";

await pdfSays("https://www.minervasec.hk/download/dbe87ef3-7e17-4ec8-9c5b-20e372fe20d6", [
  /Standard Commission and Charges Table/,
  /Commission Negotiable 0\.25 ?% on Transaction Amount \(min HKD 100\.00\)/,
]);

await hkCatalogue({ folder: "minerva", least: { HKEX: 2500 } });
