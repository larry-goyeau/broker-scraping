// What one round trip costs at Volksbank Sauerland eG (DZ BANK / Atruvia
// online brokerage): buy n shares on Xetra or the Frankfurt floor and sell
// them straight back, online, in dollars. Three order prices, so three
// plans:
//   "online"    Sauerland.Depot, OnlineDepot
//   "beratung"  Sauerland.Depot, BeratungsDepot (the advised model, opened
//               by appointment; its orders can be placed online too)
//   "meindepot" Mein.Depot, for clients aged 18 to 26 ("für alle unter 27
//               Jahren")
//
// Read 2026-10-26, depot page, "Depotmodelle, Konditionen und Gebühren",
// "Aktien und Optionsscheine, Handel an inländischen Börsen":
//   BeratungsDepot "Grundentgelt 20,00 €" + "variabler Anteil nach
//   Ordergröße 0,85 %"; OnlineDepot "Grundentgelt 7,50 €" + "0,25 %,
//   Maximal 80,00 €"; Mein.Depot "Best Execution 3,95 €", "Weisungsorder
//   4,95 €". Depot fees for both Sauerland.Depot models: "Basisentgelt Depot
//   p.a. 18,00 €" (members 6,00 €) and "Depot-/Verwahrungsentgelt pro Jahr
//   0,15 %"; Mein.Depot: "die Depotführung ist kostenlos":
//   https://www.vb-sauerland.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.vb-sauerland.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
// The table names shares and warrants only; exchange-traded funds, ETCs and
// ETNs bought on an exchange are priced like shares here. No price list PDF
// is linked from the bank's site.
//
// A side: online 7.50 € + 0.25 % × value, at most 80 €; Beratung 20 € +
// 0.85 % × value; Mein.Depot 4.95 € (a catalogue row is an order on its own
// venue, a "Weisungsorder"; the 1 € Best Execution saving is a remark). The
// venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz"). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed: N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: foreign exchanges, partial fills on different days.
//
//   node brokers/volksbanksauerla/volksbanksauerla_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbanksauerla/volksbanksauerla_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side
const CUSTODY = "Custody 0.15% a year plus 18 € a year.";

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * BEST_EXECUTION_SAVING) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Sauerland",
  folder: "volksbanksauerla",
  catalogueUrl: new URL("volksbanksauerla-parsed.json", import.meta.url),
  url: "https://www.vb-sauerland.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Sauerland eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "OnlineDepot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 7.5, rate: 0.0025, max: 80, label: "OnlineDepot, inländische Börsen" }),
      remark: CUSTODY,
      basis:
        "page Wertpapierdepot Volksbank Sauerland relue le 2026-10-26, OnlineDepot, inländische Börsen : " +
        "7,50 € + 0,25 % du Kurswert, max 80 €",
    },
    beratung: {
      label: "BeratungsDepot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 20, rate: 0.0085, label: "BeratungsDepot, inländische Börsen" }),
      remark: CUSTODY,
      basis:
        "page Wertpapierdepot Volksbank Sauerland relue le 2026-10-26, BeratungsDepot, inländische Börsen : " +
        "20,00 € + 0,85 % du Kurswert",
    },
    meindepot: {
      label: "Mein.Depot (under 27)",
      commission: () => ({ eur: MEINDEPOT, note: "Mein.Depot, Weisungsorder : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page Wertpapierdepot Volksbank Sauerland relue le 2026-10-26, Mein.Depot : Weisungsorder 4,95 €, Best Execution 3,95 €",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
