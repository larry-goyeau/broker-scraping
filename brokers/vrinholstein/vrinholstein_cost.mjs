// What one round trip costs at VR Bank in Holstein eG (Pinneberg; DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars. Two online
// order prices, so two plans:
//   "online"    the standard depot
//   "meindepot" meinDepot, for clients aged 0 to 30 inclusive
//
// Read 2026-10-26:
//   https://www.vrbank-in-holstein.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Provisionen für die Orderausführung im Online-Brokerage", "Ausführung
//   im Inland", Aktien and "Investmentanteile über Börse" "0,25 % vom
//   Kurswert", Mindestpreis "9,95 €", Maximalpreis "59,95 €"; "Limitgebühren
//   im Online-Brokerage ... 0,00 €"; Depotgebühren a quarter, Kurswert "bis
//   20.000,00 €" 5,95 €, "20.000,01 € bis 50.000,00 €" 17,85 €, "ab
//   50.000,01 €" 35,70 €; "Kommt es infolge enger Marktverhältnisse zu
//   Teilausführungen an unterschiedlichen Tagen, so wird jede Teilausführung
//   wie ein gesonderter Auftrag abgerechnet."
//   https://www.vrbank-in-holstein.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   (Konditionen Stand 01.07.2026) "alle zwischen 0 und einschließlich 30
//   Jahren"; Depotgebühren "kostenlos"; Ausführung im Inland "Pauschale für
//   Best-Execution Orders 3,95 €", "Pauschale für Orders ohne
//   Best-Execution 4,95 €".
//
// A side: online max(9.95, min(59.95, 0.25 % × value)); meinDepot 4.95 € (a
// catalogue row is an order on its own venue, gemäß Weisung; the 1 € Best
// Execution saving, where DZ BANK picks Quotrix, Tradegate, Xetra, Frankfurt
// or Stuttgart, is the remark "Fees might be x% lower ...", x = buy and sell
// together over the round trip's fees). Shares, ETFs, ETCs and ETNs take the
// same price. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate with no margin printed for securities: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// foreign exchanges (0,25 %, min 40,00 €), partial fills on different days.
//
//   node brokers/vrinholstein/vrinholstein_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrinholstein/vrinholstein_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price as a cut of the meinDepot order price itself.
function bestExecutionRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

const SCHEDULE = {
  broker: "VR Bank in Holstein",
  folder: "vrinholstein",
  catalogueUrl: new URL("vrinholstein-parsed.json", import.meta.url),
  url: "https://www.vrbank-in-holstein.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank in Holstein eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "Depot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.0025, min: 9.95, max: 59.95, label: "Online-Brokerage Inland, Aktien" }),
      remark: "Custody 23.80 € a year up to 20,000 € held (71.40 € to 50,000 €, then 142.80 €).",
      basis:
        "page Wertpapierdepot VR Bank in Holstein relue le 2026-10-26 : Online-Brokerage, exécution en Allemagne, " +
        "0,25 % du Kurswert, min 9,95 €, max 59,95 €, plus les frais de la place",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Pauschale für Orders ohne Best-Execution : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page meinDepot VR Bank in Holstein (Konditionen du 01.07.2026) relue le 2026-10-26 : 4,95 € l'ordre sur la place choisie, " +
        "3,95 € en Best Execution, plus les frais de la place",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
