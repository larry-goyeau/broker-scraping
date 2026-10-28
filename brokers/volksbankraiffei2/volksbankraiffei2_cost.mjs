// What one round trip costs at Volksbank Raiffeisenbank Dachau eG (DZ BANK /
// Atruvia online brokerage, OnlineBanking and VR Banking App): buy n shares
// on Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars.
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-201
//   Preisaushang, Fassung 1.21, Stand 05.10.2026, page 2, "Wertpapiere",
//   "Ausführung und Abwicklung eines Kommissionsauftrags zum Kauf oder
//   Verkauf von", "Ausführung im Inland", column "Online-Brokerage": "Aktien
//   ... 0,250 % vom Kurswert, + 4,90 EUR mind. 9,90 EUR max. 59,90 EUR"; the
//   same for "Verzinsliche Wertpapiere" (through the bank 1,000 % mind. 19,90
//   EUR, by phone "zzgl. 9,90 EUR": not online); "Limitvormerkung, -änderung
//   und -streichung 0,00 EUR pro Auftrag"; custody "vierteljährlich 0,0357 %
//   vom Kurswert/Nennwert", "Mindestpreis pro Depot (inkl. USt.) 4,95 EUR",
//   "Die Verwahrentgelte entfallen, wenn im Abrechnungszeitraum mindestens
//   eine Wertpapiertransaktion durchgeführt wurde".
//   https://www.vr-dachau.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   the same online price, "Aktien, Zertifikate, festverzinsliche
//   Wertpapiere, Investmentanteile (über Börse) 0,25% vom Kurswert zzgl.
//   4,90 €, mind. 9,90 € max. 59,90 €".
//   https://www.vr-dachau.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot "für alle unter 31 Jahren", "Kostenlose Depotführung",
//   "Trades ab 3,95 Euro" (no fuller meinDepot order price is printed).
//
// A side: min(59.90, max(9.90, 4.90 € + 0.25 % × value)); the same for
// shares, ETFs ("Investmentanteile (über Börse)"), ETCs and ETNs
// ("Zertifikate"). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Remark: meinDepot (under 31) trades from 3.95 € an order, so "Fees might
// be x% lower if you are under 31.", x = the cut of the standard price at
// the order's value when 3.95 € a side takes its place. Only the "ab" figure is
// printed, so meinDepot is not a row of its own (as in
// ../volksbankraiffei/volksbankraiffei_cost.mjs). Custody (0.14 % a year)
// is waived for any quarter with a trade: not in the remark.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank or by phone, foreign
// exchanges (online min 34.90 €, max 94.90 €), partial fills on different
// days.
//
//   node brokers/volksbankraiffei2/volksbankraiffei2_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankraiffei2/volksbankraiffei2_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { base: 4.9, rate: 0.0025, min: 9.9, max: 59.9 };
const MEIN_DEPOT_FROM = 3.95;

function remark({ notionalEur }) {
  const own = pctFee(notionalEur, ORDER).eur;
  if (!(own > MEIN_DEPOT_FROM)) return "";
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `Fees might be ${pct}% lower if you are under 31.` : "";
}

const SCHEDULE = {
  broker: "Volksbank Raiffeisenbank Dachau",
  folder: "volksbankraiffei2",
  catalogueUrl: new URL("volksbankraiffei2-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-201",
  readOn: "2026-10-26",
  entity: "Volksbank Raiffeisenbank Dachau eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Volksbank Raiffeisenbank Dachau du 05.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "4,90 € + 0,25 % du Kurswert, min 9,90 €, max 59,90 €, plus les frais de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland" }),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
