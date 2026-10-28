// What one round trip costs at VR Bank München Land eG (DZ BANK / Atruvia
// online brokerage, OnlineBanking and VR Banking App): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars.
//
// Read 2026-10-26:
//   https://atruvia.scene7.com/is/content/atruvia/VRBML-Preisaushangpdf
//   Preisaushang, Stand 01.10.2026, "Wertpapiere", "Ausführung eines
//   Kommissionsauftrages zum Kauf oder Verkauf von", "Ausführung im Inland",
//   column "Online-Brokerage Provision: % vom Kurswert / Minimum / Maximum":
//   "Aktien ... Staffel nach Kurswert 0,15 - 0,25 % vom Kurswert / Minimum
//   9,95 EUR", the same for "Verzinsliche Wertpapiere" (through the bank
//   1,00 % / Minimum 25,00 EUR: not online); "Limitvormerkung, -änderung und
//   -streichung ... pro Online-Brokerage-Auftrag 1,25 EUR", footnote 1 "Wird
//   nur berechnet, wenn der Auftrag nicht ausgeführt wird" (not on an
//   executed trip); custody "Jährlich 1,4875 ‰ vom Kurswert/Nennwert",
//   "Mindestpreis pro Depot (inkl. USt.) 11,90 EUR p.a.", "Mindestpreis pro
//   Bestandsposten (inkl. USt.) 4,76 EUR p.a.".
//   https://www.vr-bank-muenchen-land.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   the Staffel: "Aktien, Optionsscheine, Investmentfonds, Verzinsliche
//   Wertpapiere ...", "Provision vom Kurswert/Minimum", "0,01 - 4.999,99 Euro
//   9,95 Euro", "5.000,00 - 24.999,99 Euro 0,25 %", "25.000,00 bis 99.999,99
//   Euro 0,20 %", "Ab 100.000,00 Euro 0,15 %".
//
// A side, by the order's value: 9.95 € up to 4,999.99 €, 0.25 % up to
// 24,999.99 €, 0.20 % up to 99,999.99 €, 0.15 % from 100,000 € (at least
// 9.95 €); the same for shares, ETFs ("Investmentfonds") and ETCs/ETNs
// (notes, "Verzinsliche Wertpapiere" row, same price). The venue's charges
// come on top, priced in ../1822direkt/germanyCost.mjs (Xetra Basic;
// Frankfurt Transaktions- and Handelsentgelt; group "dz": 0.10 € delivery
// fee a side on Tradegate). Same on the buy and the sell.
//
// Remark: custody 0.15 % a year, at least 4.76 € a line. No meinDepot or
// other depot model is offered on the bank's pages.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate (DZ BANK GenoFX), with no margin printed for securities: forced,
// unpublished FX, N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: orders through the bank, foreign exchanges (min
// 40 € EU, 50 € elsewhere), partial fills on different days.
//
//   node brokers/vrmunchenland/vrmunchenland_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrmunchenland/vrmunchenland_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, bandFee, printCli } from "../1822direkt/germanyCost.mjs";

const BANDS = [
  { upTo: 4999.99, base: 9.95, min: 9.95 },
  { upTo: 24999.99, rate: 0.0025, min: 9.95 },
  { upTo: 99999.99, rate: 0.002, min: 9.95 },
  { upTo: Infinity, rate: 0.0015, min: 9.95 },
];

const SCHEDULE = {
  broker: "VR Bank München Land",
  folder: "vrmunchenland",
  catalogueUrl: new URL("vrmunchenland-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/VRBML-Preisaushangpdf",
  readOn: "2026-10-26",
  entity: "VR Bank München Land eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang VR Bank München Land du 01.10.2026 et page Wertpapierdepot relus le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
    "9,95 € jusqu'à 4 999,99 €, 0,25 % jusqu'à 24 999,99 €, 0,20 % jusqu'à 99 999,99 €, 0,15 % au-delà, plus les frais de la place",
  commission: ({ notionalEur }) => bandFee(notionalEur, BANDS, "Online-Brokerage Inland"),
  remark: "Custody 0.15% a year, at least 4.76 € a line.",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
