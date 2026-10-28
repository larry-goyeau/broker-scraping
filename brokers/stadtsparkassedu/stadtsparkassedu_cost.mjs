// What one round trip costs in Stadtsparkasse Düsseldorf's S-Neo depot: buy
// n shares on Tradegate BSX and sell them straight back, online, in
// dollars.
//
// Read 2026-10-26:
//   https://www.sskduesseldorf.de/de/home/privatkunden/wertpapier-und-boerse/s-neo.html
//   "Kauf- und Verkaufsorder an der Börse: 0,95 Euro"; "Depotführung S-Neo:
//   0 Euro (bis zu einem Depotwert von 24.999,99 Euro)", "Ab 25.000,00 Euro
//   bis 49.999,99 Euro 0,10% p.a.", "Ab 50.000,00 Euro 0,20% p.a.", "Beim
//   Erreichen einer Schwelle gilt der jeweilige Prozentsatz für das gesamte
//   Depotvolumen." The detailed PLV is shown only at account opening.
//   The page names no exchange; Tradegate comes from broker-list.json and
//   biallo's footnote to the S-Neo 0.95 € price, "bei Handel über Tradegate
//   Exchange" (https://www.biallo.de/depot/news/s-neo-sparkasse-im-vergleich/).
//   Tradegate BSX charges no transaction fee and no courtage
//   (../tradegatedirect/tradegateCost.mjs).
//
// A side: 0.95 €. A round trip is 2 × 0.95 € + the Tradegate book once +
// the buy-side FTT from taxMap.mjs (French, Italian, Spanish); UK / Irish
// stamp does not reach a Tradegate trade.
//
// Cash is the Sparkasse Girokonto in euro and every line is euro: no FX.
// Remark: custody 0.10 % a year on the whole depot from 25,000 €, 0.20 %
// from 50,000 €. Left out: savings plans (0.25 € an execution), funds
// bought from the fund company.
//
//   node brokers/stadtsparkassedu/stadtsparkassedu_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/stadtsparkassedu/stadtsparkassedu_cost.mjs IT0003128367 Tradegate EUR --shares=100 --price=8.6
//
// `roundTrip(...)` reads files, not the network.

import { tradegateRoundTrip, printCli } from "../tradegatedirect/tradegateCost.mjs";

const SCHEDULE = {
  broker: "Stadtsparkasse Düsseldorf (S-Neo)",
  folder: "stadtsparkassedu",
  catalogueUrl: new URL("stadtsparkassedu-parsed.json", import.meta.url),
  url: "https://www.sskduesseldorf.de/de/home/privatkunden/wertpapier-und-boerse/s-neo.html",
  readOn: "2026-10-26",
  entity: "Stadtsparkasse Düsseldorf, S-Neo",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème S-Neo de la Stadtsparkasse Düsseldorf (page S-Neo, Preise und Konditionen) relu le 2026-10-26",
  commission: () => ({ eur: 0.95, note: "0,95 € par ordre" }),
  minBuy: null,
  remark: "Custody 0.10% a year on the whole depot from 25,000 €, 0.20% from 50,000 €.",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
