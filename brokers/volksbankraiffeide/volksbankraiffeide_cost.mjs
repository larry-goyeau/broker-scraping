// What one round trip costs at VR-Bank Würzburg (Volksbank Raiffeisenbank
// Würzburg eG; DZ BANK / Atruvia online brokerage): buy n shares on Xetra,
// the Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars. Two online depot models, so two plans.
//
// Read 2026-10-26, depot page, "Depotmodelle, Konditionen und Gebühren":
//   https://www.vr-bank-wuerzburg.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   DepotOnline ("wenn Sie Ihre Wertpapiere nur online handeln möchten"):
//   "Online-Order an inländischen Börsen 0,2 bis 0,4 % vom Kurswert, mind.
//   19,90 € EUR" ("Service-Order an inländischen Börsen 0,5 bis 1 %": not
//   online); custody "Depotverwaltung pro Quartal 4,00 EUR Mindestpreis" or
//   "Depotpostenentgelt je Posten pro Quartal 0,03 % bis 0,05 % vom
//   Kurswert, mind. 1,25 EUR".
//   meinDepot ("an junge Leute bis zum 30. Lebensjahr"): "Online-Order für
//   inländische Best-Execution-Aufträge 3,95 € EUR", "Online-Order an allen
//   anderen inländischen Börsenplätzen 4,95 € EUR"; custody 0,00 EUR.
//
// Plans (one row each, `query.plan`), a side:
//   depotonline  max(19.90, 0.40 % × value): a discretionary range takes the
//                max (owner rule); the 0.20 % end is the remark "Fees might
//                be x% lower." (a cut of this order's commission, minimum
//                included) when it changes the sum
//   meindepot    4.95 € (up to 30)
// A catalogue row is an order on its own venue ("gemäß Weisung"), so
// meinDepot pays 4.95 €; the 3.95 € Best Execution price (DZ BANK then
// picks the venue) is the remark "Fees might be x% lower ...", x = 1.00 €
// over 4.95 €, 20%. The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: the
// Beraterdepot (the depot for advised trading, 0.5 to 1 %, min 29.90 €),
// service orders, foreign exchanges (+25 €; meinDepot 34.95 €), partial
// fills on different days.
//
//   node brokers/volksbankraiffeide/volksbankraiffeide_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankraiffeide/volksbankraiffeide_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.95;
const MIN = 19.9;
const PAGE = "page Wertpapierdepot de la VR-Bank Würzburg relue le 2026-10-26";
const CUSTODY = "Custody up to 0.20% a year, at least 16 €.";

const depotOnline = (v, rate) => pctFee(v, { rate, min: MIN, label: "DepotOnline, Online-Order Inland (haut de la fourchette 0,2-0,4 %)" });

function rangeRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return CUSTODY;
  const high = depotOnline(notionalEur, 0.004).eur;
  const low = Math.max(MIN, 0.002 * notionalEur);
  const x = (100 * (high - low)) / high;
  const pct = x >= 10 ? Math.round(x) : Number(x.toFixed(1));
  return pct > 0 ? `Fees might be ${pct}% lower. ${CUSTODY}` : CUSTODY;
}

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return "";
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  depotonline: {
    label: "DepotOnline",
    commission: ({ notionalEur }) => depotOnline(notionalEur, 0.004),
    remark: rangeRemark,
    basis: `${PAGE} : DepotOnline, Online-Order Inland 0,2 à 0,4 % du Kurswert (retenu 0,4 %), min 19,90 €`,
  },
  meindepot: {
    label: "meinDepot (up to 30)",
    commission: () => ({ eur: MEINDEPOT, note: "meinDepot, alle anderen inländischen Börsenplätze : 4,95 € l'ordre" }),
    remark: bestExecutionRemark,
    basis: `${PAGE} : meinDepot (jusqu'à 30 ans) 4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution`,
  },
};

const SCHEDULE = {
  broker: "VR-Bank Würzburg",
  folder: "volksbankraiffeide",
  catalogueUrl: new URL("volksbankraiffeide-parsed.json", import.meta.url),
  url: "https://www.vr-bank-wuerzburg.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Raiffeisenbank Würzburg eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "depotonline",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
