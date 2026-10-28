// What one round trip costs at Ihre Volksbank eG Neckar Odenwald Main
// Tauber (ihre-vb.de; DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra, the Frankfurt floor or Tradegate and sell them straight back,
// online, in dollars. Two depots with different order prices, so two plans.
//
// Read 2026-10-26:
//   Wertpapierdepot page, "IhrDepot - Online Order": "Orderpauschale* 9,90
//   EUR", "zzgl. Provision vom Kurswert 0,25 %", "Maximalgebühr 99,90 EUR",
//   "*Zzgl. 33 EUR für Aufträge an ausländischen Börsen"; custody
//   "Grunddepotentgelt pro Jahr 18,00 EUR", "Verwahrentgelt pro Jahr (inkl.
//   USt) vom Kurswert 0,18 %", "Mindestpostenentgeld pro Jahr 6,00 EUR":
//   https://www.ihre-vb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   meinDepot page ("für alle unter 31 Jahren"), "meinDepot - Online Order":
//   "Orderpauschale Inlandsbörsen 4,95 EUR", "- als Best Execution
//   aufgeführt 3,95 EUR", "Orderpauschale Auslandsbörsen 34,95 EUR",
//   "Grunddepotentgelt 0,00 EUR", "Verwahrentgelt quartalsweise 0,00 %":
//   https://www.ihre-vb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   Preisaushang Stand 01.06.2026, "Wertpapiere", Online-Brokerage
//   (Ausführung im Inland): "Pauschale je Order 9,90 EUR", "Alle
//   Wertpapierarten - Provision in % vom Kurswert 0,25", "Maximal 99,90
//   EUR" (Beratung 19,90 EUR + 0,75 %, not this trip):
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang%2001.06.2026pdf-2
//
// Plans (one row each, `query.plan`), a side:
//   ihrdepot   min(99.90, 9.90 € + 0.25 % × value)
//   meindepot  4.95 € (under 31). A catalogue row is an order on its own
//              venue ("gemäß Weisung"), so 4.95 € is priced and the 1 € Best
//              Execution saving is a remark.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by DZ BANK at its
// GenoFX rate, no margin printed for securities: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: adviser
// orders, foreign exchanges (+33 €; meinDepot 34.95 €), the "15 Frei-Trades
// zum Start" of meinDepot (a welcome offer), partial fills on different
// days.
//
//   node brokers/ihrevolksbanknec/ihrevolksbanknec_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/ihrevolksbanknec/ihrevolksbanknec_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
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
  broker: "Ihre Volksbank Neckar Odenwald Main Tauber",
  folder: "ihrevolksbanknec",
  catalogueUrl: new URL("ihrevolksbanknec-parsed.json", import.meta.url),
  url: "https://www.ihre-vb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Ihre Volksbank eG Neckar Odenwald Main Tauber (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "ihrdepot",
  plans: {
    ihrdepot: {
      label: "IhrDepot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 9.9, rate: 0.0025, max: 99.9, label: "IhrDepot, Online Order" }),
      remark: "Custody 0.18% a year plus 18 €.",
      basis:
        "barème Ihre Volksbank relu le 2026-10-26 (page Wertpapierdepot et Preisaushang du 01.06.2026) : " +
        "IhrDepot, Online Order 9,90 € + 0,25 % du Kurswert, max 99,90 €",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, Orderpauschale Inlandsbörsen : 4,95 € l'ordre" }),
      remark: meinDepotRemark,
      basis:
        "page meinDepot d'Ihre Volksbank relue le 2026-10-26 (moins de 31 ans) : " +
        "4,95 € l'ordre sur une place allemande, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
