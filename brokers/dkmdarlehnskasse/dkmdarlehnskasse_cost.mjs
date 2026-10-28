// What one round trip costs at DKM Darlehnskasse Münster eG: buy n shares on
// Xetra, the Frankfurt floor or Tradegate through the bank's Online-
// Brokerage (the DZ BANK brokerage of the cooperative banks, OnlineBanking
// and VR Banking App) and sell them straight back, in dollars.
//
// Read 2026-10-26:
//   Preisaushang Stand 01.10.2026, "Wertpapiere", "Ausführung eines
//   Kommissionsauftrags zum Kauf oder Verkauf", "Ausführung im Inland",
//   column "Online-Brokerage": "Aktien/Festverzinsliche Wertpapiere ... 0,19 %
//   zzgl. Courtage mind. 10,00 EUR max. 60,00 EUR"; "Gemanagte
//   Investmentfonds/Indexfonds (ETF) ... 0,19 % zzgl. Courtage mind. 10,00
//   EUR max. 60,00 EUR" (in person 0,50 % / 3 %, min 30,00 EUR);
//   "jährlicher Preis pro Depot 14,88 EUR", "jährlicher Preis meinDepot
//   kostenfrei":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-7
//   meinDepot page: "für alle bis einschließlich 27 Jahren", "Trades ab 3,95
//   Euro" (no fuller meinDepot order price is printed):
//   https://www.dkm.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// A side: min(60, max(10, 0.19 % × value)). The "Courtage" is the venue's
// charge, priced in ../1822direkt/germanyCost.mjs from Deutsche Börse's list
// (on Frankfurt the Handelsentgelt; group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell. ETCs and ETNs are notes and take
// the share row, which has the same online price.
//
// Remark: meinDepot (27 or younger) trades from 3.95 € an order, so "Fees
// might be x% lower if you are 27 or younger.", x = the cut of the standard
// price at the order's value when 3.95 € takes its place. Only the "ab" figure is
// printed, so meinDepot is not a row of its own. The 14.88 € a year depot
// price is small and left out.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders in person, foreign exchanges (min 40 €),
// partial fills on different days.
//
//   node brokers/dkmdarlehnskasse/dkmdarlehnskasse_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/dkmdarlehnskasse/dkmdarlehnskasse_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { rate: 0.0019, min: 10, max: 60 };
const MEIN_DEPOT_FROM = 3.95;

function remark({ notionalEur }) {
  const own = pctFee(notionalEur, ORDER).eur;
  if (!(own > MEIN_DEPOT_FROM)) return "";
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `Fees might be ${pct}% lower if you are 27 or younger.` : "";
}

const SCHEDULE = {
  broker: "DKM Darlehnskasse Münster",
  folder: "dkmdarlehnskasse",
  catalogueUrl: new URL("dkmdarlehnskasse-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-7",
  readOn: "2026-10-26",
  entity: "DKM Darlehnskasse Münster eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang DKM du 01.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "0,19 % du Kurswert, min 10 €, max 60 €, plus la courtage de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland" }),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
