// What one round trip costs at VR-Bank Bonn Rhein-Sieg eG (a Volksbank on
// the DZ BANK / Atruvia online brokerage): buy n shares on Xetra, the
// Frankfurt floor or Tradegate and sell them straight back, online, in
// dollars.
//
// Read 2026-10-26. The only order price the bank publishes is meinDepot's:
//   https://www.vrbank-brs.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//   "Orderpauschale für inländische Best-Execution Orders 3,95 €",
//   "Orderpauschale alle inländischen Börsen 4,95 €", "Kostenfreie
//   Depotführung"; meinDepot "können alle unter 31 Jahren ... nutzen",
//   "Über 18? Jetzt schnell und einfach meinDepot online eröffnen."
// The standard Wertpapierdepot page prints no order price, and no
// Preisaushang or Preis- und Leistungsverzeichnis is linked from the site
// (rechtliche-hinweise.html lists only the Entgeltinformationen of the
// current accounts):
//   https://www.vrbank-brs.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
// So this file prices meinDepot, the depot for clients aged 18 to 30.
//
// A side: 4.95 € ("alle inländischen Börsen"). A catalogue row is an order
// on its own venue, so the 3.95 € Best Execution price (the bank then picks
// the venue) is a remark "Fees might be x% lower." The venue's charges come
// on top, priced in ../1822direkt/germanyCost.mjs (group "dz": Xetra and
// Frankfurt Basic models, 0.10 € delivery fee a side on Tradegate). Same on
// the buy and the sell.
//
// Cash is euro only. A non-euro Xetra line is converted by the bank at its
// own rate with no margin printed: N/A. Taxes (French, Italian, Spanish FTT
// on the buy) from taxMap.mjs. Left out: the standard depot (no published
// price), foreign exchanges, partial fills on different days.
//
//   node brokers/vrbonnrheinsieg/vrbonnrheinsieg_cost.mjs DE0007164600 XETR EUR --shares=4 --price=215
//
// `roundTrip(...)` reads files, not the network.

import { germanyRoundTrip, printCli } from "../1822direkt/germanyCost.mjs";

const MEINDEPOT = 4.95;
const BEST_EXECUTION = 3.95;

// The Best Execution price as a cut of the meinDepot order price itself.
function bestExecutionRemark() {
  const pct = Math.round((100 * (MEINDEPOT - BEST_EXECUTION)) / MEINDEPOT);
  return `Fees might be ${pct}% lower.`;
}

const SCHEDULE = {
  broker: "VR-Bank Bonn Rhein-Sieg",
  folder: "vrbonnrheinsieg",
  catalogueUrl: new URL("vrbonnrheinsieg-parsed.json", import.meta.url),
  url: "https://www.vrbank-brs.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html",
  readOn: "2026-10-26",
  entity: "VR-Bank Bonn Rhein-Sieg eG (DE)",
  group: "dz",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis:
    "page meinDepot VR-Bank Bonn Rhein-Sieg relue le 2026-10-26 : 4,95 € l'ordre sur toute place allemande, 3,95 € en Best Execution (seul prix d'ordre publié, dépôt des moins de 31 ans)",
  commission: () => ({ eur: MEINDEPOT, note: "meinDepot, Orderpauschale alle inländischen Börsen : 4,95 €" }),
  remark: bestExecutionRemark,
};

export function roundTrip(query) {
  return germanyRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
