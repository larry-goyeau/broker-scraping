// What one round trip costs at VR Bank im südlichen Franken eG (a Volksbank
// on the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back through the
// Online-Brokerage, in dollars.
//
// Read 2026-10-26:
//   https://www.vr-sf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Orderentgelt", column "Online": Aktien "0,25 % vom Kurswert, 12,50 €
//   mindestens und 69,95 € maximal"; "Sonstige Emittenten /
//   Investmentanteile" the same (ETFs, ETCs and ETNs of other issuers than
//   DZ BANK); "Emittent DZ BANK AG (Turbos, Aktienanleihen, Zertifikate,
//   Optionsscheine)" 0,25 %, min 4,95 € (not on this catalogue); the column
//   "Beratung" (1 %, min 25 €) is not this trip. "Limit Vormerkung,
//   Änderung, Streichung" online "0,00 €". Custody "0,00 € ab zwei
//   Börsenorders pro Quartal sonst 0,04 % des Depotwertes; mindestens 4,00 €
//   pro Quartal".
//   Preisaushang Stand 08.07.2026, "Wertpapiere", Ausführung im Inland,
//   Aktien, "Online-Brokerage ... 0,25 %, mind. 12,50 EUR – max. 69,95 EUR";
//   "Limitvormerkung -änderung und -streichung ... bei Online-Brokerage
//   0,00 EUR pro Auftrag"; "Girosammelverwahrung (inkl. USt.): 0,04 %
//   vierteljährlich vom Kurswert", "Mindestpreis pro Depot 4,00 EUR",
//   "entfällt ab zwei Order pro Quartal (provisionsbasiert)":
//   https://atruvia.scene7.com/is/content/atruvia/2026-07-06%20Preisaushangpdf
//
// A side: max(12.50, min(69.95, 0.25 % × value)). The venue's charges come on
// top, priced in ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery
// fee a side on Tradegate). Same on the buy and the sell.
//
// meinDepot (under 31) is not a plan here: its page prints only "Trades ab
// 3,95 Euro" (the Best Execution price) and neither the page nor the
// Preisaushang gives the price of an order on a named venue, which is what
// a catalogue row is.
//   https://www.vr-sf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// adviser orders, foreign exchanges (min 39.95 €), partial fills on
// different days.
//
//   node brokers/vrimsudlichenfra/vrimsudlichenfra_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrimsudlichenfra/vrimsudlichenfra_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "VR Bank im südlichen Franken",
  folder: "vrimsudlichenfra",
  catalogueUrl: new URL("vrimsudlichenfra-parsed.json", import.meta.url),
  url: "https://www.vr-sf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank im südlichen Franken eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "barème VR Bank im südlichen Franken relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 08.07.2026) : " +
    "Online-Brokerage en Allemagne 0,25 % du Kurswert, min 12,50 €, max 69,95 €",
  commission: ({ notionalEur }) =>
    pctFee(notionalEur, { rate: 0.0025, min: 12.5, max: 69.95, label: "Orderentgelt Online, Inland" }),
  remark: "Custody 0.16% a year (at least 16 €) unless 2 trades a quarter.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
