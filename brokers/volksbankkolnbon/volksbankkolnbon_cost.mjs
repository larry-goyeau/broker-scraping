// What one round trip costs at Volksbank Köln Bonn eG: buy n shares on Xetra,
// the Frankfurt floor or Tradegate through the bank's Online-Brokerage (the
// DZ BANK brokerage of the cooperative banks, OnlineBanking and VR Banking
// App) and sell them straight back, in dollars. Three depot models with
// different order prices, so three plans.
//
// Read 2026-10-26:
//   Wertpapierdepot page, "Depotmodelle, Konditionen und Gebühren",
//   "Orderentgelte Inland Kommissionsgeschäft": VobaDepot "persönlich: 1,00 %
//   mind. 25,00 €", VobaDepot Premium "persönlich: 0,80 % mind. 25,00 €",
//   both "Online-Rabatt 50 %"; meinDepot "4,95 € für alle dt. Börsenplätze
//   und Best Execution für 3,95 €", "meinDepot kann bis zu einer
//   Betragsgrenze von 50.000 € genutzt werden":
//   https://www.volksbank-koeln-bonn.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   Preisaushang Stand 20.10.2026 (Nr. 05/2026), "Wertpapiere", INLAND,
//   Aktien, ETF, sonstige Wertpapiere: VobaDepot "Online-Brokerage: 0,50% vom
//   Kurswert, mind. 12,50 EUR"; VobaDepot Premium "Online-Brokerage: 0,40%
//   vom Kurswert, mind. 12,50 EUR"; meinDepot "Persönlich und Online-
//   Brokerage: 4,95 EUR pro Order", "3,95 EUR pro Order (bei Best
//   Execution-Ausführung)"; meinDepot "Höchstalter Depotinhaber bis
//   einschließlich 30 Jahre und maximalem Depotvolumen von 50.000,00 EUR";
//   "Zusätzlich wird die Bank, die ihr bei der Auftragsausführung und
//   -abwicklung von Dritten berechneten Auslagen und fremden Kosten in
//   Rechnung stellen." No cap is printed. Custody: VobaDepot 0,15 % and
//   Premium 0,12 % (mind. 199,00 EUR) of the depot a year, plus a 20,00 EUR
//   Servicepauschale; meinDepot free:
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-13
//
// Plans (one row each, `query.plan`), a side:
//   vobadepot  max(12.50, 0.50 % × value)
//   premium    max(12.50, 0.40 % × value)
//   meindepot  4.95 € (age 30 or under, depot up to 50,000 €). A catalogue
//              row is an order on its own venue ("gemäß Weisung"), so 4.95 €
//              is priced and the 1 € Best Execution saving is a remark.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell. The VobaDepot Komfort (Pauschalpreismodell, 1.50 % a year with
// the first 50 orders included) is a custody price: not this trip.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate "durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist" (Preisaushang), no margin printed: N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// branch orders (1.00 % / 0.80 %, min 25 €), the 7.50 € fee on limit orders
// that expire unexecuted, partial fills on different days (billed as
// separate orders).
//
//   node brokers/volksbankkolnbon/volksbankkolnbon_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankkolnbon/volksbankkolnbon_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
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
  broker: "Volksbank Köln Bonn",
  folder: "volksbankkolnbon",
  catalogueUrl: new URL("volksbankkolnbon-parsed.json", import.meta.url),
  url: "https://www.volksbank-koeln-bonn.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Köln Bonn eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "vobadepot",
  plans: {
    vobadepot: {
      label: "VobaDepot",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.005, min: 12.5, label: "Online-Brokerage VobaDepot" }),
      remark: "Custody 0.15% a year plus 20 €.",
      basis:
        "barème Volksbank Köln Bonn relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 20.10.2026) : " +
        "VobaDepot, Online-Brokerage Inland 0,50 % du Kurswert, min 12,50 €",
    },
    premium: {
      label: "VobaDepot Premium",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.004, min: 12.5, label: "Online-Brokerage VobaDepot Premium" }),
      remark: "Custody 0.12% a year (at least 199 €) plus 20 €.",
      basis:
        "barème Volksbank Köln Bonn relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 20.10.2026) : " +
        "VobaDepot Premium, Online-Brokerage Inland 0,40 % du Kurswert, min 12,50 €",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, Inland, Online-Brokerage : 4,95 € l'ordre" }),
      remark: meinDepotRemark,
      basis:
        "Preisaushang Volksbank Köln Bonn du 20.10.2026, meinDepot (jusqu'à 30 ans, dépôt jusqu'à 50 000 €) : " +
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
