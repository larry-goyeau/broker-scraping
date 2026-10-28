// What one round trip costs at VR Bank Nord eG (a Volksbank in
// Schleswig-Holstein on the DZ BANK / Atruvia online brokerage): buy n shares
// on Xetra or the Frankfurt floor and sell them straight back, online, in
// dollars. Two order prices, so two plans:
//   "online"    the Wertpapierdepot, online brokerage
//   "meindepot" meinDepot, for clients aged 18 to 30
//
// Read 2026-10-26:
//   Preisaushang der VR Bank Nord eG, Stand 09.10.2026, page 2,
//   "Wertpapiere, Ausführung und Abwicklung eines Kommissionsauftrags",
//   Ausführung im Inland, "Provision: Online-Brokerage": Aktien "0,40 % vom
//   Kurswert, mind. 9,95 EUR", verzinsliche Wertpapiere the same online (the
//   other column, 1,00 % min 15 EUR, is the non-online order). No separate
//   line for exchange-traded funds, ETCs or ETNs: the online rate is the same
//   for every class printed, so it is used for them too. "Limitvormerkung,
//   -änderung und -streichung 0,00 EUR". Custody "jährlich 0,149 % vom
//   Kurswert", at least 5.95 € a depot and 2.90 € a holding; meinDepot 0.00 €:
//   https://atruvia.scene7.com/is/content/atruvia/aktueller-preisaushangpdf-1
//   Depot page, "Stand: Juli 2026": "Handelsgebühr pro Online-Auftrag ab
//   9,95 €", "Depotführung pro Jahr ab 5,95 €":
//   https://www.vrbanknord.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   meinDepot page ("junge Erwachsene - bis einschließlich 30 Jahre"),
//   "Börsenorderentgelte": "Orderpauschale für inländische
//   Best-Execution-Orders 3,95 €", "Orderpauschale für alle inländischen
//   Börsen 4,95 €":
//   https://www.vrbanknord.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// A side: online max(9.95, 0.40 % × value); meinDepot 4.95 €. A catalogue
// row is an order on its own venue ("gemäß Weisung"), so meinDepot pays
// 4.95 € and the 1 € Best Execution saving (the bank then picks the venue)
// is a remark, as a cut of the 4.95 € order price (20 %). The venue's charges come on top, priced in
// ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: branch orders, foreign exchanges,
// DZ BANK Derivate (4.95 €, not on this catalogue), partial fills on
// different days.
//
//   node brokers/vrnord/vrnord_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrnord/vrnord_cost.mjs DE0007164600 XFRA EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

// The Best Execution saving as a cut of the order price itself.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * BEST_EXECUTION_SAVING) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "VR Bank Nord",
  folder: "vrnord",
  catalogueUrl: new URL("vrnord-parsed.json", import.meta.url),
  url: "https://atruvia.scene7.com/is/content/atruvia/aktueller-preisaushangpdf-1",
  readOn: "2026-10-26",
  entity: "VR Bank Nord eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "Online-Brokerage",
      commission: ({ notionalEur }) => pctFee(notionalEur, { rate: 0.004, min: 9.95, label: "Online-Brokerage, Inland" }),
      remark: "Custody 0.149% a year, min 2.90 € a holding.",
      basis: "Preisaushang VR Bank Nord Stand 09.10.2026, Inland, Online-Brokerage : 0,40 % du Kurswert, min 9,95 €, relu le 2026-10-26",
    },
    meindepot: {
      label: "meinDepot (18-30)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale für alle inländischen Börsen : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page meinDepot VR Bank Nord (Stand Juli 2026) relue le 2026-10-26 : 4,95 € l'ordre sur une place allemande désignée, " +
        "3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
