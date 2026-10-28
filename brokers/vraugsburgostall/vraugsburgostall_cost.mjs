// What one round trip costs at VR Bank Augsburg-Ostallgäu eG (a Volksbank on
// the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars. Two online order prices, so two plans:
//   "online"    the Online depot
//   "meindepot" meinDepot, "bis einschließlich 30 Jahre"
//
// Read 2026-10-26:
//   https://www.vrbank-augsburg-ostallgaeu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   table "Leistungen", columns Online / Standard / meinDepot, row
//   "Börsenorder Online": Orderentgelt Online "0,25%", "Mindestpreis
//   Inland/Ausland 9,95/39,95 €"; meinDepot "3,95 €" with footnote 6)
//   "Orderpauschale für inländische Best-Execution-Orders 3,95 EUR.
//   Orderpauschale für alle inländischen Börsen 4,95 EUR." The Standard
//   column has no online order price (its "Börsenorder Filiale oder
//   Telefon" price is 1,00 %, min 24,95 €): not this trip. Custody: Online
//   "0,0893 %" of the depot, at least "9,95 € p.a"; Standard 0,1488 %, at
//   least 19,95 €; meinDepot 0,00 €.
//   meinDepot page ("Trades ab 3,95 Euro"):
//   https://www.vrbank-augsburg-ostallgaeu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   No Preisaushang PDF is linked from the bank's legal pages.
//
// A side: online max(9.95, 0.25 % × value); meinDepot 4.95 €. A catalogue
// row is an order on its own venue ("gemäß Weisung"), so meinDepot pays the
// 4.95 € "alle inländischen Börsen" price; the 3.95 € Best Execution price
// (DZ BANK then picks Quotrix, Tradegate, Xetra, Frankfurt or Stuttgart) is
// the remark "Fees might be x% lower.", x = the cut of the 4.95 € order
// price (1 € / 4.95 €). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz": 0.10 € delivery fee a side on
// Tradegate). Same on the buy and the sell. No cap is printed.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch and phone orders, foreign exchanges (min 39.95 €), partial fills on
// different days.
//
//   node brokers/vraugsburgostall/vraugsburgostall_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vraugsburgostall/vraugsburgostall_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

function bestExecutionRemark() {
  const pct = Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "VR Bank Augsburg-Ostallgäu",
  folder: "vraugsburgostall",
  catalogueUrl: new URL("vraugsburgostall-parsed.json", import.meta.url),
  url: "https://www.vrbank-augsburg-ostallgaeu.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank Augsburg-Ostallgäu eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "Online",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.0025, min: 9.95, label: "Börsenorder Online, Inland" }),
      remark: "Custody 0.09% a year, at least 9.95 €.",
      basis:
        "barème VR Bank Augsburg-Ostallgäu relu le 2026-10-26 (page Wertpapierdepot) : dépôt Online, " +
        "Börsenorder Online 0,25 % du Kurswert, min 9,95 € en Allemagne",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, alle inländischen Börsen : 4,95 € l'ordre" }),
      remark: bestExecutionRemark,
      basis:
        "barème VR Bank Augsburg-Ostallgäu relu le 2026-10-26 (page Wertpapierdepot, note 6) : meinDepot (jusqu'à 30 ans) " +
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
