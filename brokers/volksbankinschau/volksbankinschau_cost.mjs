// What one round trip costs at Volksbank in Schaumburg und Nienburg eG (DZ
// BANK / Atruvia online brokerage, OnlineBanking and VR Banking App): buy n
// shares on Xetra, the Frankfurt floor or Tradegate and sell them straight
// back, online, in dollars.
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/7207-preisaushangpdf-1
//   Preisaushang, Stand 02.10.2026, page 3, "Wertpapiere", "Ausführung und
//   Abwicklung eines Kommissionsauftrags zum Kauf oder Verkauf von",
//   "Ausführung im Inland", column "Online-Brokerage Provision: in % vom
//   Kurswert / Minimum", "Alle Wertpapierarten": "Kurswert < 5.000 EUR 0,50
//   %, mind. 15,00 EUR"; "Kurswert < 50.000 EUR 0,25 %, mind. 15,00 EUR";
//   "Kurswert >= 50.000 EUR 0,15 %" (through the bank 1,00 % mind. 30,00
//   EUR / 0,75 % / 0,50 %: not online); "Limitvormerkung, -änderung und
//   -streichung 0,00 EUR pro Auftrag"; "Girosammelverwahrung (inkl. USt.):
//   vierteljährlich vom Kurswert Depotgesamtkurswert < 150T€ 0,20%",
//   "Mindestpreis pro Depot (inkl. USt.) 6,25 EUR".
//   https://www.vb-isun.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot "für alle unter 31 Jahren", "Kostenlose Depotführung",
//   "Trades ab 3,95 Euro" (no fuller meinDepot order price is printed).
//
// A side, by the order's value: under 5,000 € max(15, 0.50 %), under
// 50,000 € max(15, 0.25 %), from 50,000 € 0.15 %; the same for shares, ETFs,
// ETCs and ETNs ("Alle Wertpapierarten"). The venue's charges come on top,
// priced in ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt
// Transaktions- and Handelsentgelt; group "dz": 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Remarks: custody 0.20 % of the depot, billed quarterly, at least 6.25 € a
// quarter (the Preisaushang does not say whether the 0.20 % is a yearly or a
// quarterly rate, so the remark keeps its wording); meinDepot (under 31)
// trades from 3.95 € an order, so "Fees might be x% lower if you are under
// 31.", computed at the order's value with 3.95 € a side in place of the
// standard price. Only the "ab" figure is printed, so meinDepot is not a row
// of its own (as in ../dkmdarlehnskasse/dkmdarlehnskasse_cost.mjs).
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank, foreign exchanges (online
// 0,50 % mind. 40,00 EUR), partial fills on different days.
//
//   node brokers/volksbankinschau/volksbankinschau_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankinschau/volksbankinschau_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const BANDS = [
  { upTo: 4999.99, rate: 0.005, min: 15 },
  { upTo: 49999.99, rate: 0.0025, min: 15 },
  { upTo: Infinity, rate: 0.0015 },
];
const MEIN_DEPOT_FROM = 3.95;
const CUSTODY = "Custody 0.20% of the depot, billed quarterly (min 6.25 € a quarter).";

function remark({ notionalEur, venue, listing }) {
  const own = bandFee(notionalEur, BANDS).eur;
  if (!(own > MEIN_DEPOT_FROM)) return CUSTODY;
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `${CUSTODY} Fees might be ${pct}% lower if you are under 31.` : CUSTODY;
}

const SCHEDULE = {
  broker: "Volksbank in Schaumburg und Nienburg",
  folder: "volksbankinschau",
  catalogueUrl: new URL("volksbankinschau-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/7207-preisaushangpdf-1",
  readOn: "2026-10-26",
  entity: "Volksbank in Schaumburg und Nienburg eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Volksbank in Schaumburg und Nienburg du 02.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "0,50 % du Kurswert sous 5 000 €, 0,25 % sous 50 000 €, min 15 €, 0,15 % au-delà, plus les frais de la place",
  commission: ({ notionalEur }) => bandFee(notionalEur, BANDS, "Online-Brokerage Inland"),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
