// What one round trip costs at VR Bank Kempten-Oberallgäu eG (DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars.
//
// Read 2026-10-26, depot page, "DepotOnline - Konditionen und Gebühren":
//   https://www.vrbank-ke-oa.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Aktien, Optionsscheine, Verzinsliche Wertpapiere, ... Investmentanteile
//   über die Börse" "0,25% vom Kurswert, mind. 12,50 Euro / max. 59,95 Euro
//   (Inland)" ("0,50% vom Kurswert, mind. 35,00 Euro / max. 79,95 Euro
//   (Ausland)": not this place). Custody "Depotgebühr pro Quartal inkl. USt.
//   (Girosammelverwahrung) 0,045% vom Kurswert, mind. 1,50 Euro pro Posten",
//   "Mindestpreis pro Depot 3,75 Euro".
//
// A side: max(12.50, min(59.95, 0.25 % × value)). The venue's charges come
// on top, priced in ../1822direkt/germanyCost.mjs (group "dz": 0.10 €
// delivery fee a side on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// DepotKlassik (its prices sit only in the Preis- und Leistungsverzeichnis,
// which the site does not publish); meinDepot (under 31), whose pages print
// only "Trades ab 3,95 Euro", the Best Execution price, and not the price of
// an order on a named venue; foreign exchanges; partial fills on different
// days.
//   https://www.vrbank-ke-oa.de/privatkunden/junge-kunden/meindepot.html
//
//   node brokers/vrkemptenoberall/vrkemptenoberall_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrkemptenoberall/vrkemptenoberall_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "VR Bank Kempten-Oberallgäu",
  folder: "vrkemptenoberall",
  catalogueUrl: new URL("vrkemptenoberall-parsed.json", import.meta.url),
  url: "https://www.vrbank-ke-oa.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank Kempten-Oberallgäu eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page Wertpapierdepot de la VR Bank Kempten-Oberallgäu relue le 2026-10-26 : " +
    "DepotOnline, 0,25 % du Kurswert, min 12,50 €, max 59,95 € (Inland)",
  commission: ({ notionalEur }) =>
    pctFee(notionalEur, { rate: 0.0025, min: 12.5, max: 59.95, label: "DepotOnline, Inland" }),
  remark: "Custody 0.18% a year, at least 6 € a holding.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
