// What one round trip costs at Volksbank Bodensee-Oberschwaben eG (DZ BANK /
// Atruvia online brokerage): buy n shares on Xetra or the Frankfurt floor
// and sell them straight back, online, in dollars. Two online order prices,
// so two plans:
//   "online"    OnlineDepot (the KlassikDepot prints the same online price;
//               its 1,0 % min 25 € is the adviser/phone order)
//   "meindepot" meinDepot, for clients under 31
//
// Read 2026-10-26, depot models page, "Orderentgelte":
//   "Orderentgelt im Online-Brokerage": KlassikDepot and OnlineDepot "4,95 €
//   + 0,25 % vom Kurswert min. 9,95 € und max. 89,95 €"; meinDepot "3,95 €
//   Orderpauschale für Best-Execution Orders", "4,95 € Orderpauschale".
//   "Aktien, Fonds und Optionsscheine an allen inländischen Börsen":
//   OnlineDepot the same 4,95 € + 0,25 %, min 9,95 €, max 89,95 €; meinDepot
//   the same 3,95 € / 4,95 €. Footnote: "Je Order ... Von fremden Dritten in
//   Rechnung gestellte Auslagen und Kosten werden weitergegeben." Limit
//   orders "gebührenfrei". Custody, OnlineDepot "14,28 € pro Posten" a year;
//   meinDepot "kostenfreie Depotführung":
//   https://www.vb-bo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html
//   https://www.vb-bo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
// Shares, funds and certificates all take this row; ETCs and ETNs too.
//
// A side: online 4.95 € + 0.25 % × value, at least 9.95 €, at most 89.95 €;
// meinDepot 4.95 € (a catalogue row is an order on its own venue; the 1 €
// Best Execution saving is a remark). The venue's charges come on top,
// priced in ../1822direkt/germanyCost.mjs (group "dz"). Same on the buy and
// the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed: N/A. Taxes (French, Italian, Spanish FTT on the buy) from
// taxMap.mjs. Left out: adviser/phone orders, foreign exchanges, partial
// fills on different days.
//
//   node brokers/volksbankbodense/volksbankbodense_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankbodense/volksbankbodense_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

function bestExecutionRemark() {
  const pct = Math.round((100 * BEST_EXECUTION_SAVING) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Bodensee-Oberschwaben",
  folder: "volksbankbodense",
  catalogueUrl: new URL("volksbankbodense-parsed.json", import.meta.url),
  url: "https://www.vb-bo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html",
  readOn: "2026-10-26",
  entity: "Volksbank Bodensee-Oberschwaben eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    online: {
      label: "OnlineDepot",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 4.95, rate: 0.0025, min: 9.95, max: 89.95, label: "Orderentgelt im Online-Brokerage" }),
      remark: "Custody 14.28 € a holding a year.",
      basis:
        "page Depotmodelle Volksbank Bodensee-Oberschwaben relue le 2026-10-26, OnlineDepot, inländische Börsen : " +
        "4,95 € + 0,25 % du Kurswert, min 9,95 €, max 89,95 €",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page Depotmodelle Volksbank Bodensee-Oberschwaben relue le 2026-10-26, meinDepot : 4,95 € l'ordre, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
