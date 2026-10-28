// What one round trip costs at VR Bank Donau-Oberschwaben eG (a Volksbank
// on the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars. Two online order prices, so two plans:
//   "direct"     VRDO Depot (via Direct Brokerage), clients from 31 ("Nur
//                Online")
//   "meindepot"  meinDepot, clients younger than 31
//
// Read 2026-10-26, depot page, "Depotmodelle, Konditionen und Gebühren":
//   https://www.vrdo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   "Orderpreis bei Kauf und Verkauf von weiteren Wertpapieren, inkl.
//   Investmentanteile, Bezugsrechte, etc. über inländische Börsen":
//   meinDepot "4,95 €***", VRDO Depot "1 %**, mind. 25 €", VRDO Depot (via
//   Direct Brokerage)* "0,25 %**, mind. 12,50 €, max. 59,95 €";
//   "* Nur Online, in Ausnahmefällen über Berater- und Telefonservice
//   möglich", "***Transaktionskosten bei Best Execution-Order i. H. v.
//   3,95 EUR"; Zielgruppe meinDepot "Kunden jünger als 31 Jahre", the VRDO
//   depots "Kunden ab 31 Jahre". "Depotverwaltung (pro Jahr inkl. USt.)":
//   meinDepot 0,00 €; both VRDO depots "2,38‰ vom Kurswert", "Mindestpreis
//   Depot: 9,95 €", "Maximalpreis Depot: 250 €".
//   The plain VRDO Depot (1 %, min 25 €) is the adviser depot; the bank's
//   online-only price for the same clients is the Direct Brokerage one, so
//   it is the row for clients from 31.
//
// A side: direct 0.25 % × value, at least 12.50 €, at most 59.95 €;
// meinDepot 4.95 €. A catalogue row is an order on its own venue, so the
// 3.95 € Best Execution price is a remark ("Fees might be x% lower."). The
// venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": Xetra and Frankfurt Basic models, 0.10 € delivery fee a side
// on Tradegate). Same on the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// adviser orders, DZ BANK products, foreign exchanges, partial fills on
// different days.
//
//   node brokers/vrdonauoberschwa/vrdonauoberschwa_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//   node brokers/vrdonauoberschwa/vrdonauoberschwa_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215 --plan=meindepot
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
  broker: "VR Bank Donau-Oberschwaben",
  folder: "vrdonauoberschwa",
  catalogueUrl: new URL("vrdonauoberschwa-parsed.json", import.meta.url),
  url: "https://www.vrdo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html",
  readOn: "2026-10-26",
  entity: "VR Bank Donau-Oberschwaben eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  defaultPlan: "direct",
  plans: {
    direct: {
      label: "VRDO Depot (Direct Brokerage)",
      commission: ({ notionalEur }) =>
        pctFee(notionalEur, { rate: 0.0025, min: 12.5, max: 59.95, label: "Direct Brokerage, places allemandes" }),
      remark: "Custody 0.238% a year, min 9.95 €, max 250 €.",
      basis:
        "page Wertpapierdepot VR Bank Donau-Oberschwaben relue le 2026-10-26, VRDO Depot (via Direct Brokerage) : 0,25 % du Kurswert, min 12,50 €, max 59,95 €",
    },
    meindepot: {
      label: "meinDepot (under 31)",
      commission: () => ({ eur: MEINDEPOT, note: "meinDepot, places allemandes : 4,95 € l'ordre" }),
      remark: bestExecutionRemark,
      basis:
        "page Wertpapierdepot VR Bank Donau-Oberschwaben relue le 2026-10-26, meinDepot (moins de 31 ans) : 4,95 € l'ordre, 3,95 € en Best Execution",
    },
  },
};

export const PLANS = Object.fromEntries(Object.entries(SCHEDULE.plans).map(([id, p]) => [id, { id, label: p.label }]));
export const planOf = (plan) => PLANS[String(plan || SCHEDULE.defaultPlan).toLowerCase()] || null;

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
