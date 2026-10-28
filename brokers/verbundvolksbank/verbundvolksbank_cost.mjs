// What one round trip costs at VerbundVolksbank OWL (a Volksbank on the DZ
// BANK / Atruvia online brokerage): buy n shares on Xetra, the Frankfurt
// floor or Tradegate and sell them straight back, online, in dollars, in
// meinDepot, the only depot whose order price the bank publishes.
//
// Read 2026-10-26:
//   https://www.verbundvolksbank-owl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   "für alle jungen Erwachsenen von 18 bis 31 Jahren"; "Kostenfreie
//   Depotführung"; "Pauschale Ordergebühren bei Nutzung der „Best
//   Execution“ für 3,95 Euro, bei anderen inländischen Börsenplätzen für
//   4,95 Euro".
//   The Wertpapierdepot page
//   (https://www.verbundvolksbank-owl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html)
//   prints no price, and the price list the site links (Auszug aus dem
//   Preisverzeichnis, Fassung 01.2026,
//   https://atruvia.scene7.com/is/content/atruvia/Auszug_Preis-und%20Leistungsverzeichnispdf)
//   covers accounts and payments only. So the ordinary depot (clients aged
//   31 and over) has no published order price and is not priced here.
//
// A catalogue row is an order on its own venue ("gemäß Weisung"): 4.95 € a
// side. The 3.95 € Best Execution price (DZ BANK then picks Quotrix,
// Tradegate, Xetra, Frankfurt or Stuttgart) is the remark "Fees might be x%
// lower ...", x = the cut of the 4.95 € order price itself (20). The
// venue's charges come on top, priced in ../1822direkt/germanyCost.mjs
// (group "dz": 0.10 € delivery fee a side on Tradegate). Same on the buy
// and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted at DZ BANK's rate
// with no margin printed for securities: forced, unpublished FX, N/A. Taxes
// (French, Italian, Spanish FTT on the buy) from taxMap.mjs. Left out:
// foreign exchanges, partial fills on different days.
//
//   node brokers/verbundvolksbank/verbundvolksbank_cost.mjs DE0007164600 XETR EUR --shares=4 --price=214.4
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, printCli } from "../1822direkt/germanyCost.mjs";

const BEST_EXECUTION = 3.95;
const MEINDEPOT = 4.95;

const SCHEDULE = {
  broker: "VerbundVolksbank OWL",
  folder: "verbundvolksbank",
  catalogueUrl: new URL("verbundvolksbank-parsed.json", import.meta.url),
  url: "https://www.verbundvolksbank-owl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html",
  readOn: "2026-10-26",
  entity: "VerbundVolksbank OWL eG",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "barème VerbundVolksbank OWL relu le 2026-10-26 (page meinDepot, 18 à 31 ans) : 4,95 € l'ordre sur une autre " +
    "place allemande, 3,95 € en Best Execution",
  commission: () => ({ eur: MEINDEPOT, note: "meinDepot, autres places allemandes : 4,95 € l'ordre" }),
  remark({ notionalEur }) {
    if (!(notionalEur > 0)) return "";
    const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
    return `Fees might be ${pct}% lower if sent as a Best Execution order.`;
  },
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
