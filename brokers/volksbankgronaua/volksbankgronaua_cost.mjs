// What one round trip costs at Volksbank Gronau-Ahaus eG (DZ BANK / Atruvia
// online brokerage): buy n shares on Xetra, the Frankfurt floor or
// Tradegate and sell them straight back, online, in dollars. Three depot
// models with different order prices, so three plans.
//
// Read 2026-10-26:
//   Wertpapierdepot page, "Depotmodelle, Konditionen und Gebühren" ("Stand
//   01.07.2026"), "Entgelte für Transaktionen (online)", "Grundpreis je
//   Order": Depot.Klassik "0,5 % zzgl. 10,00 €", Depot.Online "0,25 % zzgl.
//   10,00 €", meinDepot "3,95 €" ("Gilt nur für inländische
//   Best-Execution-Orders. Ansonsten 4,95 €"); "Maximalpreis im Inland":
//   Depot.Klassik "Nicht vorhanden", Depot.Online "60,00 €", meinDepot
//   "4,95 €"; custody Depot.Klassik "0,15 % p.a." below 100,000 € ("Mindestens
//   10 € pro Quartal"), Depot.Online "0 €" ("Ab drei Börsentransaktionen pro
//   Quartal, ansonsten 15 € pro Quartal"), meinDepot "0,00 €":
//   https://www.vbga.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   Preis- und Leistungsverzeichnis Stand 01.10.2026, 9.2.8: Depot.Klassik
//   "Online 0,50% zzgl. 10,00 EUR"; Depot.Online "Online 0,25%, zzgl. 10,00
//   EUR max. 60,00 EUR"; meinDepot "Berater/Online für inländische
//   Best-Execution Orders 3,95 EUR", "Berater/Online für alle inländischen
//   Börsen 4,95 EUR"; 9.1.1 "Zusätzlich wird die Bank die ihr bei der
//   Auftragsausführung und -abwicklung von Dritten berechneten Auslagen und
//   fremden Kosten in Rechnung stellen"; "Limitvormerkung, -änderung und
//   -streichung 0,00 EUR pro Auftrag":
//   https://atruvia.scene7.com/is/content/atruvia/4024-plvpdf
//   Preisaushang Stand 26.10.2026: Depot.Klassik Online-Brokerage Inland
//   "0,50% zzgl. 10,00 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/4024-preisaushangpdf
//
// Plans (one row each, `query.plan`), a side:
//   klassik    10.00 € + 0.50 % × value, no cap
//   online     min(60, 10.00 € + 0.25 % × value)
//   meindepot  4.95 € (under 31). A catalogue row is an order on its own
//              venue ("gemäß Weisung"), so 4.95 € is priced and the 1 € Best
//              Execution saving is a remark.
// The venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy and
// the sell. The UnionDepot / Vermögen fee-based models (0.99 % to 1.49 % of
// the depot) are custody prices: not this trip. The PLV's 9.1.1 grid prints
// "Alle Wertpapierarten, Ordervolumen unter 100.000,00 EUR (Depot.Klassik)
// 0,15%" (0,12 % / 0,10 % above): the same tiers as the Depot.Klassik
// custody on the site and in 9.2.8, while the Preisaushang's own 9.1.1 grid
// prints 0,50 % zzgl. 10,00 EUR online, so it is read as custody, not added.
//
// Cash is euro only. A non-euro Xetra line is converted at a rate "durch ein
// Verfahren ermittelt, bei dem die Marktgerechtigkeit des Wechselkurses
// sichergestellt ist" (PLV 9.1.1), no margin printed: N/A. Taxes (French,
// Italian, Spanish FTT on the buy) from taxMap.mjs. Left out: adviser
// orders, foreign exchanges (+25 €, meinDepot +19.90 €), partial fills on
// different days (billed as separate orders).
//
//   node brokers/volksbankgronaua/volksbankgronaua_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/volksbankgronaua/volksbankgronaua_cost.mjs IE00B4L5Y983 XGAT EUR --shares=7 --price=123 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEIN_DEPOT = 4.95;
const BEST_EXECUTION_SAVING = 1.0; // 4,95 € → 3,95 € a side

// The Best Execution saving as a cut of the order price itself.
function meinDepotRemark() {
  return `Fees might be ${Math.round((100 * BEST_EXECUTION_SAVING) / MEIN_DEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "Volksbank Gronau-Ahaus",
  folder: "volksbankgronaua",
  catalogueUrl: new URL("volksbankgronaua-parsed.json", import.meta.url),
  url: "https://www.vbga.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "Volksbank Gronau-Ahaus eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "online",
  plans: {
    klassik: {
      label: "Depot.Klassik",
      commission: ({ notionalEur }) => pctFee(notionalEur, { base: 10, rate: 0.005, label: "Depot.Klassik, online" }),
      remark: "Custody 0.15% a year (at least 10 € a quarter).",
      basis:
        "barème Volksbank Gronau-Ahaus relu le 2026-10-26 (page Wertpapierdepot et PLV du 01.10.2026, 9.2.8) : " +
        "Depot.Klassik, ordre en ligne 0,50 % du Kurswert + 10,00 €, sans plafond",
    },
    online: {
      label: "Depot.Online",
      commission: ({ notionalEur }) => pctFee(notionalEur, { base: 10, rate: 0.0025, max: 60, label: "Depot.Online" }),
      remark: "Custody 15 € a quarter under 3 trades a quarter.",
      basis:
        "barème Volksbank Gronau-Ahaus relu le 2026-10-26 (page Wertpapierdepot et PLV du 01.10.2026, 9.2.8) : " +
        "Depot.Online, ordre en ligne 0,25 % du Kurswert + 10,00 €, max 60,00 € en Inland",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEIN_DEPOT, note: "meinDepot, toutes places allemandes : 4,95 € l'ordre" }),
      remark: meinDepotRemark,
      basis:
        "barème Volksbank Gronau-Ahaus relu le 2026-10-26 (page Wertpapierdepot et PLV du 01.10.2026, 9.2.8), meinDepot (moins de 31 ans) : " +
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
