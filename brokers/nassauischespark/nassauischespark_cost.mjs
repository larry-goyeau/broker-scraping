// What one round trip costs in Nassauische Sparkasse's (Naspa) S-Neo depot:
// buy n shares on Tradegate BSX and sell them straight back, online, in
// dollars.
//
// Read 2026-10-26:
//   https://www.naspa.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html
//   "An- und Verkauf von Wertpapieren: 2,00 Euro je Ausführung"; "Die
//   Transaktionsgebühren betragen unabhängig vom Depotvolumen 2,00 € je
//   Ausführung." Verwahrung und Verwaltung: "unter 25.000 Euro 0,00 % p.a.",
//   "ab 25.000 Euro 0,10 % p.a.", "ab 50.000 Euro 0,25 % p.a.".
//   The page names no exchange; Tradegate comes from broker-list.json and
//   biallo's footnote to the S-Neo price, "bei Handel über Tradegate
//   Exchange" (https://www.biallo.de/depot/news/s-neo-sparkasse-im-vergleich/).
//   Tradegate BSX charges no transaction fee and no courtage
//   (../tradegatedirect/tradegateCost.mjs).
//
// A side: 2.00 €. A round trip is 2 × 2.00 € + the Tradegate book once +
// the buy-side FTT from taxMap.mjs (French, Italian, Spanish); UK / Irish
// stamp does not reach a Tradegate trade.
//
// Cash is the Sparkasse Girokonto in euro and every line is euro: no FX.
// Remark: custody 0.10 % a year from 25,000 €, 0.25 % from 50,000 €. Left
// out: savings plans (0.50 € an execution), funds bought from the fund
// company.
//
//   node brokers/nassauischespark/nassauischespark_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/nassauischespark/nassauischespark_cost.mjs FR0000121014 Tradegate EUR --shares=2 --price=430
//
// `roundTrip(...)` reads files, not the network.

import { tradegateRoundTrip, printCli } from "../tradegatedirect/tradegateCost.mjs";

const SCHEDULE = {
  broker: "Nassauische Sparkasse (S-Neo)",
  folder: "nassauischespark",
  catalogueUrl: new URL("nassauischespark-parsed.json", import.meta.url),
  url: "https://www.naspa.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html",
  readOn: "2026-10-26",
  entity: "Nassauische Sparkasse (Naspa), S-Neo",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème S-Neo de la Naspa (page S-Neo, Preise) relu le 2026-10-26",
  commission: () => ({ eur: 2, note: "2,00 € par exécution" }),
  minBuy: null,
  remark: "Custody 0.10% a year from 25,000 €, 0.25% from 50,000 €.",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
