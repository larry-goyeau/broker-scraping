// What one round trip costs at Volksbank Raiffeisenbank Nordoberpfalz eG
// (DZ BANK / Atruvia online brokerage, OnlineBanking and VR Banking App):
// buy n shares on Xetra, the Frankfurt floor or Tradegate and sell them
// straight back, online, in dollars.
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/09.30.00.00.100%20Preisaushang%20VR%20Nopf%20Stand%2020261001pdf
//   Preisaushang, Stand 01.10.2026, "Wertpapiere", "Ausführung und
//   Abwicklung eines Kommissionsauftrags zum Kauf oder Verkauf", "Ausführung
//   im Inland", column "Online-Brokerage Provision": "Aktien ... 0,20 % vom
//   Kurswert, mind. 14,95 €, max. 59,95 €"; "Verzinsliche Wertpapiere ...
//   0,20 % vom Kurswert, mind. 14,95 €, max. 59,95 €" (through the bank
//   1,00 % mind. 25,00 EUR / 0,50 % mind. 25,00 EUR: not online); "Online
//   Brokerage: Limitänderung oder -streichung 5,00 EUR pro Auftrag";
//   "Online geführte Depots: Girosammelverwahrung (jährlich): 0,893 ‰ vom
//   Kurswert inkl. USt., mindestens pro Depot 17,85 EUR inkl. USt.,
//   mindestens pro Depotposten 11,90 EUR inkl. USt.".
//   https://www.vr-nordoberpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   meinDepot "ab 18 Jahren bis zur Vollendung des 31. Lebensjahres": "Ab
//   3,95 Euro können Sie mit meinDepot an der Börse traden und zahlen dabei
//   für die Depotführung gar nichts" (no fuller meinDepot order price is
//   printed).
//
// A side: min(59.95, max(14.95, 0.20 % × value)). ETFs, ETCs and ETNs are
// exchange-traded like shares and notes, both rows with the same online
// price. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Remarks: custody 0.09 % a year, at least 11.90 € a line; meinDepot (under
// 31) trades from 3.95 € an order, so "Fees might be x% lower if you are
// under 31.", x = the cut of the standard price itself at the order's
// value when 3.95 € takes its place. Only the "ab" figure is printed, so meinDepot is not a
// row of its own (as in ../dkmdarlehnskasse/dkmdarlehnskasse_cost.mjs).
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank, foreign exchanges (online
// min 40 €), limit changes, partial fills on different days.
//
//   node brokers/volksbankraiffei/volksbankraiffei_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankraiffei/volksbankraiffei_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const ORDER = { rate: 0.002, min: 14.95, max: 59.95 };
const MEIN_DEPOT_FROM = 3.95;
const CUSTODY = "Custody 0.09% a year, at least 11.90 € a line.";

function remark({ notionalEur }) {
  const own = pctFee(notionalEur, ORDER).eur;
  if (!(own > MEIN_DEPOT_FROM)) return CUSTODY;
  const pct = Math.round((100 * (own - MEIN_DEPOT_FROM)) / own);
  return pct > 0 ? `${CUSTODY} Fees might be ${pct}% lower if you are under 31.` : CUSTODY;
}

const SCHEDULE = {
  broker: "Volksbank Raiffeisenbank Nordoberpfalz",
  folder: "volksbankraiffei",
  catalogueUrl: new URL("volksbankraiffei-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/09.30.00.00.100%20Preisaushang%20VR%20Nopf%20Stand%2020261001pdf",
  readOn: "2026-10-26",
  entity: "Volksbank Raiffeisenbank Nordoberpfalz eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Volksbank Raiffeisenbank Nordoberpfalz du 01.10.2026 relu le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "0,20 % du Kurswert, min 14,95 €, max 59,95 €, plus les frais de la place",
  commission: ({ notionalEur }) => pctFee(notionalEur, { ...ORDER, label: "Online-Brokerage Inland" }),
  remark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
