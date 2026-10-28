// What one round trip costs at VR TeilhaberBank Metropolregion Nürnberg eG
// (a Volksbank on the DZ BANK / Atruvia online brokerage): buy n shares on
// Xetra or the Frankfurt floor and sell them straight back, online, in
// dollars. Two order prices, so two plans:
//   "direkt"    VR Depot Direkt, the online depot (VR Depot Premium, the
//               depot with advice, has the same online price on the depot
//               page)
//   "meindepot" meinDepot, for clients up to 30
//
// Read 2026-10-26:
//   Depot page, "Depotmodelle, Konditionen und Gebühren", Transaktionsgebühren:
//   meinDepot "Online: 3,95 € Orderpauschale für inländische
//   Best-Execution-Orders, 4,95 € Orderpauschale für alle inländischen
//   Börsen"; VR Depot Direkt and VR Depot Premium "Online: 0,28 % vom
//   Kurswert, mind. 10,00 € je Order, max. 69,90 €"; "Exklusive Fremdkosten".
//   Custody: VR Depot Direkt "0,025 % vom Kurswert am Quartalsende pro
//   Quartal, mindestens 7,50 € pro Quartal, mindestens 1,80 € pro Posten";
//   meinDepot free:
//   https://www.vr-teilhaberbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   Preisaushang Stand 01.10.2026, page 2, Wertpapiere, Ausführung im Inland,
//   VR Depot Direkt, Aktien, Investmentanteile über Börse, Sonstige
//   Wertpapiere: "Online Order 0,280 % vom Kurswert mind. 10,00 EUR max.
//   69,90 EUR je Order"; "Limitvormerkung, -änderung und -streichung ...
//   0,00 EUR"; custody as above:
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushang_20261007pdf
//   (The Preisaushang prints only "0,750 % vom Kurswert zzgl. 10,00 EUR" for
//   VR Depot Premium; it is the advised depot and is not another row.)
//   "meinDepot Premium" (Depot mit Festpreis, 1,10 % p.a. of the depot, 50
//   transactions a year included) is a flat-fee custody model, not a trade
//   price: not a row.
//
// A side: Direkt 0.28 % × value, at least 10 €, at most 69.90 €; meinDepot
// 4.95 €. A catalogue row is an order on its own venue ("gemäß Weisung"),
// so meinDepot pays 4.95 € and the 1 € Best Execution saving is a remark.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz"). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank with no
// margin printed for securities: N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: offline orders (0,75 % + 10 €),
// foreign exchanges, partial fills on different days.
//
//   node brokers/vrteilhaberbankm/vrteilhaberbankm_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrteilhaberbankm/vrteilhaberbankm_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
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
  broker: "VR TeilhaberBank",
  folder: "vrteilhaberbankm",
  catalogueUrl: new URL("vrteilhaberbankm-parsed.json", import.meta.url),
  url: "https://www.vr-teilhaberbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR TeilhaberBank Metropolregion Nürnberg eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "direkt",
  plans: {
    direkt: {
      label: "VR Depot Direkt",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.0028, min: 10, max: 69.9, label: "VR Depot Direkt, Online Order, Inland" }),
      remark: "Custody 0.10% a year, at least 30 € a year.",
      basis:
        "page Wertpapierdepot et Preisaushang VR TeilhaberBank Stand 01.10.2026, VR Depot Direkt, Online Order Inland : " +
        "0,28 % du Kurswert, min 10 €, max 69,90 €, relus le 2026-10-26",
    },
    meindepot: {
      label: "meinDepot (up to 30)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale für alle inländischen Börsen : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "page Wertpapierdepot VR TeilhaberBank relue le 2026-10-26, meinDepot : 4,95 € l'ordre sur une place allemande désignée, " +
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
