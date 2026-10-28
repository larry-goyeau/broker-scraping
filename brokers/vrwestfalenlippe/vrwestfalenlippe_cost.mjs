// What one round trip costs at VR Bank Westfalen-Lippe eG (Lippstadt; DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "online"    the standard depot
//   "meindepot" meinDepot, for clients aged 18 to 26 inclusive
//
// Read 2026-10-26:
//   https://www.vrbank-wl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Online-Order Einmalanlage (vom Kurswert) 0,25 %; mind. 12,50 €"
//   (Service-Order 1,00 %, mind. 50,00 €, not online); "Order an
//   ausländischen Börsen zzgl. 40,00 €"; "Kostenlose Limitierung";
//   Depotentgelt "(pro Jahr) 0,10 % inkl. ges. MwSt. vom Kurswert am
//   Jahresende; mind. 15,00 €; 50 % Rabatt ab 50 Online-Orders p. a.".
//   https://www.vrbank-wl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   "alle zwischen 18 und einschließlich 26 Jahren", "Kostenlose
//   Depotführung", "Pauschale Ordergebühren für Einzel-Orders bei
//   inländischen Börsen von 4,95 EUR, Order als Best Execution ausgeführt
//   3,95 EUR".
//
// A side: online max(12.50, 0.25 % × value), no cap printed; meinDepot
// 4.95 € (a catalogue row is an order on its own venue, gemäß Weisung; the
// 1 € Best Execution saving, where DZ BANK picks Quotrix, Tradegate, Xetra,
// Frankfurt or Stuttgart, is the remark "Fees might be x% lower ...", x =
// the cut of the 4.95 € order price itself, 20). Shares, ETFs, ETCs and
// ETNs take the same price. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (Xetra Basic; Frankfurt Transaktions- and
// Handelsentgelt; group "dz": 0.10 € delivery fee a side on Tradegate). Same
// on the buy and the sell. The 50 % discount from 50 online orders a year is
// on the custody fee, not on the order price.
//
// Cash is euro only. A non-euro Xetra line is converted at the bank's own
// rate with no margin printed for securities: forced, unpublished FX, N/A.
// Taxes (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// Service-Orders, foreign exchanges, partial fills on different days.
//
//   node brokers/vrwestfalenlippe/vrwestfalenlippe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrwestfalenlippe/vrwestfalenlippe_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT)}% lower if sent as a Best Execution order.`;
}

const SCHEDULE = {
  broker: "VR Bank Westfalen-Lippe",
  folder: "vrwestfalenlippe",
  catalogueUrl: new URL("vrwestfalenlippe-parsed.json", import.meta.url),
  url: "https://www.vrbank-wl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank Westfalen-Lippe eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "Depot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.0025, min: 12.5, label: "Online-Order Einmalanlage" }),
      remark: "Custody 0.10% a year, min 15 € (half off from 50 online orders a year).",
      basis:
        "page Wertpapierdepot VR Bank Westfalen-Lippe relue le 2026-10-26 : Online-Order Einmalanlage 0,25 % du Kurswert, " +
        "min 12,50 €, plus les frais de la place",
    },
    meindepot: {
      label: "meinDepot (18-26)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Einzel-Order an einer inländischen Börse : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page meinDepot VR Bank Westfalen-Lippe relue le 2026-10-26 : 4,95 € l'ordre sur une place allemande, " +
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
