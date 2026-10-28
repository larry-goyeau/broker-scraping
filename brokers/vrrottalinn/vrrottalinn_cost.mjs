// What one round trip costs at VR-Bank Rottal-Inn eG (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "aktiv"     VR Depot aktiv (the online depot)
//   "meindepot" meinDepot, "für alle unter 31 Jahren"
//
// Read 2026-10-26:
//   https://www.vrbk.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Grundentgelt und Orderprovision (Inland) 9,90 EUR + 0,25 % des
//   Ordervolumens", "pauschale Depotgebühr pro Posten p.a. 4,76 EUR",
//   "Depotgebühr mindestens p.a. 11,90 EUR"; "Diese Gebühren gelten nur bei
//   online Erfassungen durch den Kunden. Ansonsten werden die
//   Standardgebühren berechnet."
//   Preisaushang Stand 06.10.2026, "Wertpapiere", Ausführung im Inland,
//   Aktien: "VR Depot aktiv Grundentgelt und Orderprovision 9,90 EUR + 0,25 %
//   vom Kurswert" (the Standard price, "0,75 – 1,0 % v. Kurswert 25,00 EUR
//   Minimum", is the non-online order); "Limitvormerkung, -änderung und
//   -streichung 5,00 EUR pro Auftrag", footnote 9) "Wird nur berechnet, wenn
//   der Auftrag nicht ausgeführt wird":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-38
//   meinDepot page, "Die Konditionen": "Ordergebühren für Einzel-Orders bei
//   Auswahl der Ausführungsart "Best Execution": nur 3,95 Euro",
//   "Ordergebühren ohne Auswahl der Ausführungsart "Best Execution": 4,95
//   Euro", "Kostenfreie Depotführung":
//   https://www.vrbk.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// A side: aktiv 9.90 € + 0.25 % × value; meinDepot 4.95 €. A catalogue row
// is an order on its own venue ("gemäß Weisung"), so meinDepot pays 4.95 €
// and the 1 € Best Execution saving (DZ BANK then picks the venue) is the
// remark "Fees might be x% lower.". The venue's charges come on top, priced
// in ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell. No minimum or cap is printed.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders, foreign exchanges (33 € + 0.25 %), the 5 € fee on limit
// orders that expire unexecuted, partial fills on different days.
//
//   node brokers/vrrottalinn/vrrottalinn_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrrottalinn/vrrottalinn_cost.mjs DE0007164600 XFRA EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

// The Best Execution saving as a cut of the order price itself.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "VR-Bank Rottal-Inn",
  folder: "vrrottalinn",
  catalogueUrl: new URL("vrrottalinn-parsed.json", import.meta.url),
  url: "https://www.vrbk.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR-Bank Rottal-Inn eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "aktiv",
  plans: {
    aktiv: {
      label: "VR Depot aktiv",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 9.9, rate: 0.0025, label: "VR Depot aktiv, Grundentgelt und Orderprovision Inland" }),
      remark: "Custody 4.76 € a holding a year, at least 11.90 €.",
      basis:
        "barème VR-Bank Rottal-Inn relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 06.10.2026) : " +
        "VR Depot aktiv, ordre en ligne en Allemagne 9,90 € + 0,25 % du Kurswert",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, sans Best Execution : 4,95 € l'ordre" }),
      remark: bestExecutionRemark,
      basis:
        "barème VR-Bank Rottal-Inn relu le 2026-10-26 (page meinDepot) : meinDepot (moins de 31 ans) " +
        "4,95 € l'ordre sur une place désignée, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
