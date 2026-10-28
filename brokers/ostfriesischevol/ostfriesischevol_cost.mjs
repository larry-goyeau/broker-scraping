// What one round trip costs at Ostfriesische Volksbank eG (Leer; DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   Preisaushang Stand 09.10.2026, page 3, "Wertpapiere", "Ausführung im
//   Inland", "Online-Brokerage Provision: … % vom Kurswert (bis 14.999 EUR)
//   / Minimum", Aktien "0,30% / 9,90 EUR" (branch column "1,00% / 30,00
//   EUR"); "Vormerkung eines Limits 0,00 EUR"; Girosammelverwahrung
//   "1,79 ‰ vom Kurswert/ Nennwert", "Mindestpreis pro Depot 50,00 EUR",
//   "Höchstpreis pro Depot 300,00 EUR"; "Porti und sonstige Auslagen sind in
//   den obigen Sätzen nicht enthalten":
//   https://atruvia.scene7.com/is/content/atruvia/0370-preisaushangpdf-1
//   meinDepot (under 31): "Trades ab 3,95 Euro", no fuller order price:
//   https://www.ostfriesische-volksbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot Premium is a flat-fee advisory depot ("1,20 % p. a. vom
//   Euro-Kurswert des Depots", 25 trades a year included, opened by
//   appointment): custody, not an order price, left out:
//   https://www.ostfriesische-volksbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   The full Preis- und Leistungsverzeichnis linked from the AGB page
//   (content/dam/f0370-0/cloud-transfer/nobot/0370-plv.pdf) answered 404.
//
// A side: max(9.90, 0.30 % × value), for an order value up to 14,999 €.
// The Preisaushang prints the rate only "bis 14.999 EUR": a larger order has
// no published price and is N/A. Shares, ETFs, ETCs and ETNs all take the
// Aktien row (exchange orders). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Remarks: custody 0.179 % a year (min 50 €, max 300 € a depot); meinDepot
// (under 31) trades from 3.95 € an order, so "Fees might be x% lower if you
// are under 31.", x = the cut of the standard price itself at the order's
// value when 3.95 € takes its place (as in
// ../volksbankinschau/volksbankinschau_cost.mjs). Only the "ab" figure is
// printed, so meinDepot is not a row of its own.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate with no margin printed for securities: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges (online 0,30 % / 29,90 EUR), partial
// fills on different days.
//
//   node brokers/ostfriesischevol/ostfriesischevol_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/ostfriesischevol/ostfriesischevol_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, euro, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { rate: 0.003, min: 9.9 };
const PRINTED_UP_TO = 14999;
const MEIN_DEPOT_FROM = 3.95;
const CUSTODY = "Custody 0.179% a year (min 50 €, max 300 €).";

function commission({ notionalEur }) {
  if (notionalEur > PRINTED_UP_TO)
    return { eur: null, why: `Provision Online-Brokerage publiée seulement jusqu'à ${euro(PRINTED_UP_TO)} € de Kurswert` };
  return pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland, Aktien" });
}

function remark({ notionalEur }) {
  const own = commission({ notionalEur }).eur;
  if (own == null || !(own > MEIN_DEPOT_FROM)) return CUSTODY;
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `${CUSTODY} Fees might be ${pct}% lower if you are under 31.` : CUSTODY;
}

const SCHEDULE = {
  broker: "Ostfriesische Volksbank",
  folder: "ostfriesischevol",
  catalogueUrl: new URL("ostfriesischevol-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/0370-preisaushangpdf-1",
  readOn: "2026-10-26",
  entity: "Ostfriesische Volksbank eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Ostfriesische Volksbank du 09.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "Aktien 0,30 % du Kurswert (jusqu'à 14 999 €), min 9,90 €, plus les frais de la place",
  commission,
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
