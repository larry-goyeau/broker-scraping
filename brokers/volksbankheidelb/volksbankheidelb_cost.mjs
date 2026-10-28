// What one round trip costs at Volksbank Heidelberg-Neckartal eG (DZ BANK /
// Atruvia online brokerage, OnlineBanking and VR Banking App): buy n shares
// on Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Two depots with different order prices, so two plans.
//
// Read 2026-10-26:
//   Wertpapierdepot page, "Depotmodelle, Konditionen und Gebühren",
//   "Online-Order: Aktien und Verzinsliche Wertpapiere Inland 0,20 % vom
//   Kurswert, zzgl. 12 EUR Stückentgelt"; custody "2,083 ‰ vom Kurswert",
//   "Mindestpreis pro Depot 23,79 €"; "Alle Preise inklusive MwSt.":
//   https://www.volksbank-hdneckartal.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   Preisaushang Stand 01.10.2026, "Wertpapiere", "per Online Brokerage
//   Inland 12,00 EUR plus 0,20 % vom Kurswert" (no floor, no cap; the branch
//   price "über Kundenberater" 1,00 % / 0,90 % / 0,80 %, mind. 25,00 EUR is
//   not this trip); "meinDepot für junge Kunden (bis 30 Jahre)", Ausführung
//   im Inland, Online-Brokerage: "Alle 4,95 EUR", "alle (Best Execution)
//   3,95 EUR"; "Limitvormerkung, -änderung und -streichung pro Auftrag 7,50
//   EUR" ("Wird nur berechnet, wenn der Auftrag nicht ausgeführt wird"). The
//   "plus eigene Spesen je Order 5,00 EUR" line belongs to the off-exchange
//   fund block (Kauf verbundfremde Fonds), not to exchange orders:
//   https://atruvia.scene7.com/is/content/atruvia/2026-10-01_Preisaushangpdf
//   meinDepot page: "für alle unter 31 Jahren", "Kostenlose Depotführung",
//   "Trades ab 3,95 Euro":
//   https://www.volksbank-hdneckartal.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// Plans (one row each, `query.plan`), a side:
//   depot      12.00 € + 0.20 % × value
//   meindepot  4.95 € (age 30 or under). A catalogue row is an order on its
//              own venue ("gemäß Weisung"), so 4.95 € is priced and the 1 €
//              Best Execution saving is a remark.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by DZ BANK at its
// GenoFX rate, no margin printed for securities: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: branch orders,
// foreign exchanges (40 € + 0.20 %; meinDepot 34.95 €), the 7.50 € fee on
// limit orders that expire unexecuted, partial fills on different days.
//
//   node brokers/volksbankheidelb/volksbankheidelb_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankheidelb/volksbankheidelb_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function meinDepotRemark() {
  return `Fees might be ${Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Heidelberg-Neckartal",
  folder: "volksbankheidelb",
  catalogueUrl: new URL("volksbankheidelb-parsed.json", import.meta.url),
  url: "https://www.volksbank-hdneckartal.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Heidelberg-Neckartal eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "depot",
  plans: {
    depot: {
      label: "Depot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { base: 12, rate: 0.002, label: "Online Brokerage Inland" }),
      remark: "Custody 0.21% a year (at least 23.79 €).",
      basis:
        "barème Volksbank Heidelberg-Neckartal relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 01.10.2026) : " +
        "Online Brokerage Inland 12,00 € + 0,20 % du Kurswert",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, Inland, Online-Brokerage : 4,95 € l'ordre" }),
      remark: meinDepotRemark,
      basis:
        "Preisaushang Volksbank Heidelberg-Neckartal du 01.10.2026, meinDepot (jusqu'à 30 ans) : " +
        "4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
