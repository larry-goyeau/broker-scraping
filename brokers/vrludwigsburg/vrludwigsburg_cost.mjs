// What one round trip costs at VR-Bank Ludwigsburg eG (a Volksbank on the
// DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars. Two
// online order prices, so two plans:
//   "standard"   VR-meinDepot25 and VR-meinDepotInvest (same online order
//                price; they differ only in custody)
//   "meindepot"  VR-meinDepot, for clients up to 30
//
// Read 2026-10-26:
//   https://www.vrbank-lb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle-investier.html
//   "Transaktionskosten (Ausführung im Inland)", "Online-Order":
//   VR-meinDepot25 "4,90 € + 0,25 %", VR-meinDepotInvest "4,90 € + 0,25 %",
//   VR-meinDepot (bis 30 Jahre) "4,95 € alle Börsenplätze; Best Execution
//   3,95 €". No minimum or cap is printed for the 4.90 € + 0.25 % price, and
//   the bank's Preisaushang (Stand 11.02.2026) prints only custody for
//   securities; no Preis- und Leistungsverzeichnis is linked. Custody:
//   VR-meinDepot25 "36,00 €" a year (12 € with Hausbank status Silber and
//   above), "0,00 % bis 25.000 € ansonsten 0,20 % auf gesamten
//   Depotbestand"; VR-meinDepotInvest 36 € + 0.15 %; VR-meinDepot free.
//   https://www.vrbank-lb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-investier.html
//   "Wertpapierorders kosten an allen inländischen Börsenplätzen 4,95 € -
//   und bei Nutzung der „Best Execution“ sogar nur 3,95 €"; "unserem Depot
//   für junge Erwachsene bis 30 Jahre".
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-220
//
// A side: standard 4.90 € + 0.25 % × value (no floor or cap printed);
// meinDepot 4.95 €. A catalogue row is an order on its own venue, so the
// 3.95 € Best Execution price is a remark ("Fees might be x% lower."). The
// venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": Xetra and Frankfurt Basic models, 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank at its
// own rate with no margin printed: N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: service orders (branch/phone),
// foreign exchanges, partial fills on different days.
//
//   node brokers/vrludwigsburg/vrludwigsburg_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrludwigsburg/vrludwigsburg_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, pctFee, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price's cut of the 4,95 € order price itself: 20 %.
function bestExecutionRemark() {
  return `Fees might be ${Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT)}% lower.`;
}

const SCHEDULE = {
  broker: "VR-Bank Ludwigsburg",
  folder: "vrludwigsburg",
  catalogueUrl: new URL("vrludwigsburg-parsed.json", import.meta.url),
  url: "https://www.vrbank-lb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle-investier.html",
  readOn: "2026-10-26",
  entity: "VR-Bank Ludwigsburg eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "standard",
  plans: {
    standard: {
      label: "VR-meinDepot25",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { base: 4.9, rate: 0.0025, label: "Online-Order VR-meinDepot25 / VR-meinDepotInvest" }),
      remark: "Custody 36 € a year, plus 0.20% a year on the whole depot above 25,000 €.",
      basis:
        "page Depotmodelle VR-Bank Ludwigsburg relue le 2026-10-26 : Online-Order 4,90 € + 0,25 % (VR-meinDepot25 et VR-meinDepotInvest), ni minimum ni plafond imprimés",
    },
    meindepot: {
      label: "VR-meinDepot (up to 30)",
      commission: () => ({ eur: MEINDEPOT, note: "VR-meinDepot, alle Börsenplätze : 4,95 €" }),
      remark: bestExecutionRemark,
      basis:
        "pages Depotmodelle et VR-meinDepot VR-Bank Ludwigsburg relues le 2026-10-26 : VR-meinDepot (jusqu'à 30 ans) 4,95 € l'ordre sur toute place allemande, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
