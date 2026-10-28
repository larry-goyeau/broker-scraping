// What one round trip costs at Volksbank Zollernalb eG (Balingen; DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   https://www.volksbank-zollernalb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "(Auszug aus dem Preis- und Leistungsverzeichnis)", "Ausführung im
//   Inland", "Online-Brokerage Provision: % Angabe vom Kurswert/ Minimum",
//   Aktien "0,25 %, min. 12,50 EUR max. 59,90 EUR" (branch column "1,00 %
//   min. 20,00 EUR"); "Limitvormerkung, -änderung und -streichung 5,00 EUR
//   pro Auftrag"; "Girosammelverwahrung (inkl. USt.) 0,119 %", "Mindestpreis
//   pro Depot (inkl. USt.) 30,00 EUR", "Mindestpreis pro Bestandsposten
//   (inkl. USt.) 5,95 EUR".
//   https://www.volksbank-zollernalb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot "für alle unter 31 Jahren", "Kostenlose Depotführung",
//   "Trades ab 3,95 Euro" (no fuller meinDepot order price is printed).
//
// A side: max(12.50, min(59.90, 0.25 % × value)). Shares, ETFs, ETCs and
// ETNs take the Aktien row (exchange orders; the Investmentanteile row is
// the off-exchange fund issue). A market order: the 5 € limit fee is a
// remark. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Remarks: limit fee; custody 0.119 % a year (min 30 € a depot, 5.95 € a
// holding); meinDepot (under 31) trades from 3.95 € an order, so "Fees might
// be x% lower if you are under 31.", x = the cut of the standard price
// itself at the order's value when 3.95 € takes its place (as in
// ../volksbankinschau/volksbankinschau_cost.mjs). Only the "ab" figure is
// printed, so meinDepot is not a row of its own.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate with no margin printed for securities: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges, partial fills on different days.
//
//   node brokers/volksbankzollern/volksbankzollern_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankzollern/volksbankzollern_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { rate: 0.0025, min: 12.5, max: 59.9 };
const MEIN_DEPOT_FROM = 3.95;
const FIXED = "Limit orders cost 5 € more. Custody 0.119% a year (min 30 €, 5.95 € a holding).";

function remark({ notionalEur }) {
  const own = pctFee(notionalEur, ORDER).eur;
  if (!(own > MEIN_DEPOT_FROM)) return FIXED;
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `${FIXED} Fees might be ${pct}% lower if you are under 31.` : FIXED;
}

const SCHEDULE = {
  broker: "Volksbank Zollernalb",
  folder: "volksbankzollern",
  catalogueUrl: new URL("volksbankzollern-parsed.json", import.meta.url),
  url: "https://www.volksbank-zollernalb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Zollernalb eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page Wertpapierdepot Volksbank Zollernalb (extrait du PLV) relue le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "Aktien 0,25 % du Kurswert, min 12,50 €, max 59,90 €, plus les frais de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland, Aktien" }),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
