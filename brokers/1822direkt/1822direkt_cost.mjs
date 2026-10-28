// What one round trip costs at 1822direkt (the direct bank of Frankfurter
// Sparkasse): buy n shares on Xetra, the Frankfurt floor or Tradegate and
// sell them straight back, online, in dollars. The 1822direkt-Aktiv-Depot,
// custody free for depots opened since 02.05.2023.
//
// Read 2026-10-26:
//   https://www.1822direkt.de/anlegen-depot/leistungen-und-konditionen/
//   "An- und Verkauf von Wertpapieren an inländischen Börsen: Grundentgelt +
//   Orderprovision 4,90 € zzgl. 0,25% vom Kurswert mindestens 9,90 € maximal
//   54,90 €"; "Handelsplatzentgelt 2,95 € (entfällt im Direkthandel)";
//   "Zuschlag zur Auftragserteilung - Online kostenlos".
//   Preis- und Leistungsverzeichnis, 3. September 2026, C.II.1.1.1 and
//   C.II.2.d (pp. 34-39), the same prices: "Handelsplatzgebühr pro Auftrag
//   ... Inländische Handelsplätze 2,95", "Direkthandel unentgeltlich":
//   https://www.1822direkt.de/fileadmin/pdf-statisch/pv_gesamt_1822direkt.pdf
//   Tradegate is an exchange, not one of the bank's Direkthandel partners
//   (Lang & Schwarz, HSBC, Baader, Vontobel, Société Générale, Deutsche Bank
//   and the cats-Direct issuers:
//   https://www.1822direkt.de/anlegen-depot/wertpapierangebot/direkthandel/),
//   so the 2.95 € applies on all three venues.
//   The exchanges' own charges come on top ("Fremdkosten in- und
//   ausländischer Börsen, sonstiger Handelsplätze", PLV C.II.2.e) and are
//   priced in ../1822direkt/germanyCost.mjs from Deutsche Börse's and
//   Tradegate's lists (group "sparkasse": no Tradegate delivery fee).
//
// A side: max(9.90, min(54.90, 4.90 + 0.25 % × value)) + 2.95 € + the
// venue's charges. Same on the buy and the sell.
//
// Remark: the Aktivtrader-Rabatt (PLV C.II.1.1.1 c): 10 % off the
// Orderprovision from 50 settled orders in the previous half-year (floor
// 8.90 €, cap 49.40 €), 20 % from 100 (floor 7.90 €, cap 43.90 €), computed
// at the order's value as the cut of the bank's own fee a side
// (Orderprovision + Handelsplatzentgelt): "fees are x% lower".
//
// Cash is euro only. A non-euro Xetra line settles at "frei gehandelte[n]
// Marktkurse[n]" (PLV B, Umrechnungskurse) with no printed margin: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) come
// from taxMap.mjs. Left out: phone (14.90 €) and written (12.90 €) orders,
// partial fills on different days (billed as separate orders).
//
//   node brokers/1822direkt/1822direkt_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//   node brokers/1822direkt/1822direkt_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, printCli } from "./germanyCost.mjs";

const ORDER = { base: 4.9, rate: 0.0025, min: 9.9, max: 54.9 };
const PLACE_FEE = 2.95;
const DISCOUNTS = [
  { trades: 50, cut: 0.1, min: 8.9, max: 49.4 },
  { trades: 100, cut: 0.2, min: 7.9, max: 43.9 },
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const provision = (v) => clamp(ORDER.base + ORDER.rate * v, ORDER.min, ORDER.max);
// A relative cut in percent: whole when 10 or more, one decimal below.
const pct = (x) => `${x >= 0.1 ? Math.round(x * 100) : Math.round(x * 1000) / 10}%`;

const SCHEDULE = {
  broker: "1822direkt",
  folder: "1822direkt",
  catalogueUrl: new URL("1822direkt-parsed.json", import.meta.url),
  url: "https://www.1822direkt.de/anlegen-depot/leistungen-und-konditionen/",
  readOn: "2026-10-26",
  entity: "1822direkt Gesellschaft der Frankfurter Sparkasse mbH",
  group: "sparkasse",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème 1822direkt (page Leistungen und Konditionen et PLV du 3 septembre 2026) relu le 2026-10-26",
  commission({ notionalEur }) {
    const order = pctFee(notionalEur, { ...ORDER, label: "Grundentgelt + Orderprovision" });
    return { eur: order.eur + PLACE_FEE, note: `${order.note} + Handelsplatzentgelt ${euro(PLACE_FEE)} €` };
  },
  remark({ notionalEur }) {
    const own = provision(notionalEur);
    const cuts = DISCOUNTS.map((d) => {
      const lower = clamp((1 - d.cut) * (ORDER.base + ORDER.rate * notionalEur), d.min, d.max);
      return { trades: d.trades, delta: (own - lower) / (own + PLACE_FEE) };
    }).filter((c) => c.delta > 0);
    if (!cuts.length) return "";
    return `${cuts[0].trades} or more trades the previous half-year: fees are ${pct(cuts[0].delta)} lower` +
      (cuts[1] ? `; ${cuts[1].trades} or more: ${pct(cuts[1].delta)} lower.` : ".");
  },
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
