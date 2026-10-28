// What one round trip costs at meine Volksbank Raiffeisenbank eG (Rosenheim,
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online (eBrokerage), in
// dollars.
//
// Read 2026-10-26:
//   https://www.vb-rb.de/privatkunden/anlegen-sparen/depot-und-brokerage/wertpapierdepot.html
//   "Aktien, Investmentanteile (über Börse), Optionsscheine, Zertifikate:
//   0,25 % vom Kurswert, mind. 9,95 Euro / max. 59,95 Euro (Ausland mind. 35
//   Euro zzgl. Fremdgebühren)"; custody "Girosammelverwahrung: 0,030 %
//   (0,025 % zzgl. MwSt), mind. 1,13 Euro ... je Posten", "Mindestdepotgebühr
//   mind. 5,95 Euro" a quarter, "ab 3 Trades: 25% Rabatt ab 6 Trades: 50%
//   Rabatt ab 12 Trades: 100% Rabatt". The PLV (3.2) prints custody at
//   "Girosammelverwahrung 0,04% pro Quartal", "Verwahrgebühren, mind. 5,95 €
//   pro Quartal": the higher of the two, 0.16 % a year, is the remark.
//   Preis- und Leistungsverzeichnis, Stand 01.09.2026, 3.1 "Kauf und
//   Verkauf": "eBrokerage Aktien / Zertifikate / Festverzinsliche
//   Wertpapiere / Investmentfonds 0,25% vom Kurswert, mind. 9,95 € / max.
//   59,95€"; the branch price ("1,00% vom Kurswert, mind. 25 € ... zzgl.
//   Spesen 2,50 €") is not this trip; "Limitgebühr bei Nichtausführung /
//   Streichung / Änderung 4,00 € bedient, e-brokerage kostenlos":
//   https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnispdf
//
// A side: max(9.95, min(59.95, 0.25 % × value)), for shares, ETFs, ETCs and
// ETNs alike. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's GenoFX
// rates with no margin printed for securities: N/A. Taxes (French, Italian,
// Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders, foreign
// exchanges, partial fills on different days.
//
//   node brokers/meinevolksbankra/meinevolksbankra_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/meinevolksbankra/meinevolksbankra_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "meine Volksbank Raiffeisenbank",
  folder: "meinevolksbankra",
  catalogueUrl: new URL("meinevolksbankra-parsed.json", import.meta.url),
  url: "https://www.vb-rb.de/privatkunden/anlegen-sparen/depot-und-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "meine Volksbank Raiffeisenbank eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème meine Volksbank Raiffeisenbank (page Wertpapierdepot et PLV Stand 01.09.2026, eBrokerage) relu le 2026-10-26",
  commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.0025, min: 9.95, max: 59.95, label: "eBrokerage" }),
  remark: "Custody 0.16% a year, min 23.80 € (25% to 100% off with 3 to 12 trades a quarter).",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
