// What one round trip costs at Vereinigte Volksbank Raiffeisenbank eG
// (Reinheim, vvrb.de; DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars.
//
// Read 2026-10-26:
//   Preisaushang Stand 01.11.2025 (the one linked from
//   https://www.vvrb.de/rechtliche-hinweise.html), "Wertpapiere",
//   "Ausführung und Abwicklung eines Kommissionsauftrags zum Kauf oder
//   Verkauf von", "Ausführung im Inland", Aktien and verzinsliche
//   Wertpapiere: "Online-Brokerage Provision: % vom Kurswert 0,25% + 9,90 €
//   max 39,90 €" (Berater/Telefon "0,80% + 15,00 €", not this trip);
//   "Limitvormerkung, -änderung und -streichung: 0,00 EUR pro Auftrag";
//   custody "Jährlich 0,14875 % vom Kurswert, mind. 7,14 € pro Position",
//   "Mindestpreis pro Depot (inkl. USt): 28,56 EUR"; "Porti und sonstige
//   Auslagen sind in den obigen Sätzen nicht enthalten":
//   https://atruvia.scene7.com/is/content/atruvia/1742-preisaushangpdf
//   The bank's site has no depot price page of its own (the usual
//   .../depot-brokerage/wertpapierdepot.html answers 404).
//
// A side: min(39.90, 9.90 + 0.25 % × value), shares, ETFs, ETCs and ETNs
// alike (the Aktien line). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by DZ BANK at its
// GenoFX rate, no margin printed for securities: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: branch and
// phone orders, foreign exchanges (0.25 % + 9.90 €, no cap), partial fills
// on different days.
//
//   node brokers/vereinigtevolksbde/vereinigtevolksbde_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vereinigtevolksbde/vereinigtevolksbde_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const SCHEDULE = {
  broker: "Vereinigte Volksbank Raiffeisenbank",
  folder: "vereinigtevolksbde",
  catalogueUrl: new URL("vereinigtevolksbde-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/1742-preisaushangpdf",
  readOn: "2026-10-26",
  entity: "Vereinigte Volksbank Raiffeisenbank eG (Reinheim, DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "Preisaushang Vereinigte Volksbank Raiffeisenbank du 01.11.2025 relu le 2026-10-26 : " +
    "Online-Brokerage Inland 0,25 % du Kurswert + 9,90 €, max 39,90 €",
  commission: ({ notionalEur }) => pctFee(notionalEur, { base: 9.9, rate: 0.0025, max: 39.9, label: "Online-Brokerage Inland" }),
  remark: "Custody 0.15% a year (at least 28.56 €).",
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
