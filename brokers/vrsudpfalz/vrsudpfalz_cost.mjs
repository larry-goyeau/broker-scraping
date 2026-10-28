// What one round trip costs at VR Bank Südpfalz eG (Landau; DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars. Three online
// order prices, so three plans.
//
// Read 2026-10-26, depot page, "Unsere Depotmodelle im Überblick":
//   https://www.vrbank-suedpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   meinDepot Direkt ("Das kostengünstige Onlinedepot"), Börsenorderentgelte:
//   "Orderentgelt Aktien & Anleihen 0,25 %", "Mindestentgelt pro Order
//   12,95 €", "Maximalentgelt pro Order --". Optional "Vieltrader-Modul":
//   "Grundpreis (pro Quartal) 29,95 €", "0,20 %", "9,95 €", "49,95 €" (max
//   footnote 3 "bei Online-Order"). Custody of both "0,00 €" under footnote
//   1, "mindestens eine provisionspflichtige Online-Transaktion ... pro
//   Quartal" (met by this trip).
//   meinDepot Easy ("für junge Leute bis 31 Jahren"): "Orderpauschale (für
//   alle Wertpapiere) 4,95 €", "Orderpauschale für Best-Execution-Aufträge
//   3,95 €"; footnote 2 "Orderprovision gilt für Börsenplätze im Inland
//   (zuzüglich eventuell anfallender Drittkosten der jeweiligen Börse)".
//   Same figures on the meinDepot Easy page:
//   https://www.vrbank-suedpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-easy.html
//
// Plans (one row each, `query.plan`), a side:
//   direkt      max(12.95, 0.25 % × value)
//   vieltrader  max(9.95, min(49.95, 0.20 % × value)), module 29.95 € a quarter
//   easy        4.95 € (under 31)
// A catalogue row is an order on its own venue ("gemäß Weisung"), so Easy
// pays 4.95 €; the 3.95 € Best Execution price (DZ BANK then picks the
// venue) is the remark "Fees might be x% lower ...", x = the cut of the
// 4.95 € order price (1.00 € / 4.95 €). ETFs (Investmentanteile über die Börse) are priced like
// shares: the table's only exchange-order line is "Aktien & Anleihen".
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// meinDepot Individual (the depot for advice at the branch: 9.95 € + 1.00 %,
// min 19.95 €), the flat-fee meinDepot Premium (1.25 % p.a. of the depot,
// 25 trades included: custody, not a trade price), the 1.00 % surcharge for
// orders through an adviser, foreign exchanges, partial fills on different
// days.
//
//   node brokers/vrsudpfalz/vrsudpfalz_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrsudpfalz/vrsudpfalz_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=easy
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const EASY = 4.95;
const PAGE = "page Wertpapierdepot de la VR Bank Südpfalz relue le 2026-10-26";

function bestExecutionRemark({ notionalEur }) {
  if (!(notionalEur > 0)) return "";
  const pct = Math.round((100 * (EASY - BEST_EXECUTION)) / EASY);
  return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
}

export const PLANS = {
  direkt: {
    label: "meinDepot Direkt",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { rate: 0.0025, min: 12.95, label: "meinDepot Direkt, Orderentgelt" }),
    remark: "",
    basis: `${PAGE} : meinDepot Direkt, Orderentgelt 0,25 % du Kurswert, min 12,95 €, sans plafond`,
  },
  vieltrader: {
    label: "meinDepot Direkt + Vieltrader-Modul",
    commission: ({ notionalEur }) =>
      pctFee(notionalEur, { rate: 0.002, min: 9.95, max: 49.95, label: "Vieltrader-Modul, Online-Order" }),
    remark: "Vieltrader module 29.95 € a quarter.",
    basis: `${PAGE} : Vieltrader-Modul (29,95 € le trimestre), 0,20 % du Kurswert, min 9,95 €, max 49,95 € en ligne`,
  },
  easy: {
    label: "meinDepot Easy (under 31)",
    commission: () => ({ eur: EASY, note: "meinDepot Easy, Orderpauschale : 4,95 € l'ordre" }),
    remark: bestExecutionRemark,
    basis: `${PAGE} : meinDepot Easy (moins de 31 ans) 4,95 € l'ordre sur une place allemande désignée, 3,95 € en Best Execution`,
  },
};

const SCHEDULE = {
  broker: "VR Bank Südpfalz",
  folder: "vrsudpfalz",
  catalogueUrl: new URL("vrsudpfalz-parsed.json", import.meta.url),
  url: "https://www.vrbank-suedpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank Südpfalz eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  plans: PLANS,
  defaultPlan: "direkt",
};

export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
