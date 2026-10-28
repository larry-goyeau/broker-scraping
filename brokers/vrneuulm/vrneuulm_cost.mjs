// What one round trip costs at VR-Bank Neu-Ulm eG (DZ BANK / Atruvia online
// brokerage): buy n shares on Xetra, the Frankfurt floor or Tradegate and
// sell them straight back, online, in dollars. Two depot models with
// different online prices, so two plans.
//
// Read 2026-10-26:
//   Depot page, "Depotmodell meinDepot Klassik", "Order (online)":
//   "Grundgebühr pro Order Inland 9,90 €", "zzgl. vom Ordervolumen 0,50 %"
//   (persönlich/telefonisch 19,90 € + 1,00 %: not this trip); footnote 3
//   "Zusätzlich werden Ihnen die Auslagen und fremden Kosten ... in Rechnung
//   gestellt"; custody "Mindestdepotgebühr pro Quartal 7,50 €",
//   "Verwahrung und Verwaltung p. a." "0,20 %":
//   https://www.vrnu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   meinDepot JungeLeute ("Bis zum 27. Geburtstag"), same figures on the
//   meinDepot page: "Order (online, persönlich, telefonisch und
//   schriftlich)" "Grundgebühr pro Order Inland 4,95 €", "Grundgebühr pro
//   Order Inland Best Execution 3,95 €", "zzgl. vom Ordervolumen 0,00 %";
//   custody 0,00 €:
//   https://www.vrnu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// Plans (one row each, `query.plan`), a side:
//   klassik      9.90 € + 0.50 % × value, no cap printed
//   jungeleute   4.95 € (under 27)
// A catalogue row is an order on its own venue ("gemäß Weisung"), so
// JungeLeute pays 4.95 €; the 3.95 € Best Execution price (DZ BANK then
// picks the venue) is the remark "Fees might be x% lower ...", x = the
// cut of the 4.95 € order price (1.00 € / 4.95 €). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: the
// flat-fee meinDepot Premium (1.50 % to 1.00 % p.a. of the depot, 39.90 € a
// quarter minimum, 50 orders a year included: custody, not a trade price),
// the first-year offer of 20 free JungeLeute orders, foreign exchanges
// (33 €), partial fills on different days.
//
//   node brokers/vrneuulm/vrneuulm_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrneuulm/vrneuulm_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=jungeleute
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const JUNGELEUTE = 4.95;

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return "";
  const pct = Math.round((100 * (JUNGELEUTE - BEST_EXECUTION)) / JUNGELEUTE);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  klassik: {
    label: "meinDepot Klassik",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { base: 9.9, rate: 0.005, label: "meinDepot Klassik, Order (online) Inland" }),
    remark: "Custody 0.20% a year, at least 30 €.",
    basis:
      "page Wertpapierdepot de la VR-Bank Neu-Ulm relue le 2026-10-26 : meinDepot Klassik, " +
      "Order (online) Inland 9,90 € + 0,50 % de l'Ordervolumen",
  },
  jungeleute: {
    label: "meinDepot JungeLeute (under 27)",
    commission: () => ({ eur: JUNGELEUTE, note: "meinDepot JungeLeute, Grundgebühr pro Order Inland : 4,95 € l'ordre" }),
    remark: bestExecutionRemark,
    basis:
      "pages Wertpapierdepot et meinDepot de la VR-Bank Neu-Ulm relues le 2026-10-26 : meinDepot JungeLeute " +
      "(moins de 27 ans) 4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution",
  },
};

const SCHEDULE = {
  broker: "VR-Bank Neu-Ulm",
  folder: "vrneuulm",
  catalogueUrl: new URL("vrneuulm-parsed.json", import.meta.url),
  url: "https://www.vrnu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR-Bank Neu-Ulm eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "klassik",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
