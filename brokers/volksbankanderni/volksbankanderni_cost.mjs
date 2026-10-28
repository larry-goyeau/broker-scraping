// What one round trip costs at Volksbank an der Niers eG (a Volksbank on the
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "individuell"  MeinDepot Individuell
//   "meindepot"    MeinDepot (bis 28 Jahre)
//
// Read 2026-10-26, depot page, "Depotmodelle, Konditionen und Gebühren":
//   https://www.vb-niers.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   MeinDepot Individuell, "Ordergebühren (Inl./Ausl., alle Gattungen)":
//   "Berater 1,00%, mind. 29,90 €", "Online 0,50%, mind. 24,90 €";
//   "Depotentgelt < 100.000 € 0,15% p.a.", "Mindestpreis 9,90 € p. Q.";
//   "Von Dritten berechnete Auslagen u. fremde Kosten werden in Rechnung
//   gestellt".
//   MeinDepot (bis 28 Jahre): "Depotentgelt kostenlos", "Ordergebühren alle
//   inländischen Börsenplätze und alle Gattungen 4,95 €", "Best-Execution
//   3,95 €".
//   MeinDepot Premium is a flat fee ("Depotentgelt < 100.000 € 1,50% p.a.",
//   "50 Transaktionen inklusive ..., darüber hinaus Gebühren des
//   Individuell-Modells (Online Transaktionen)"): a custody price, not an
//   order price, so not a row.
//
// A side: individuell 0.50 % × value, at least 24.90 €, no cap; meinDepot
// 4.95 €. A catalogue row is an order on its own venue, so the 3.95 € Best
// Execution price is a remark ("Fees might be x% lower."). The venue's
// charges come on top, priced in ../1822direkt/germanyCost.mjs (group "dz":
// Xetra and Frankfurt Basic models, 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// adviser orders, foreign exchanges, partial fills on different days.
//
//   node brokers/volksbankanderni/volksbankanderni_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankanderni/volksbankanderni_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank an der Niers",
  folder: "volksbankanderni",
  catalogueUrl: new URL("volksbankanderni-parsed.json", import.meta.url),
  url: "https://www.vb-niers.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank an der Niers eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "individuell",
  plans: {
    individuell: {
      label: "MeinDepot Individuell",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.005, min: 24.9, label: "Online" }),
      remark: "Custody 0.15% a year, min 39.60 €.",
      basis:
        "page Wertpapierdepot Volksbank an der Niers relue le 2026-10-26, MeinDepot Individuell, Online : 0,50 % du Kurswert, min 24,90 €",
    },
    meindepot: {
      label: "MeinDepot (up to 28)",
      commission: () => ({ eur: MEINDEPOT, note: "MeinDepot, toutes places allemandes : 4,95 € l'ordre" }),
      remark: bestExecutionRemark,
      basis:
        "page Wertpapierdepot Volksbank an der Niers relue le 2026-10-26, MeinDepot (jusqu'à 28 ans) : 4,95 € l'ordre, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
