// What one round trip costs in Mittelbrandenburgische Sparkasse's (MBS)
// S-Neo depot: buy n shares on Tradegate BSX and sell them straight back,
// online, in dollars.
//
// Read 2026-10-26:
//   https://www.mbs.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html
//   "Sofortorder je Trade: 0,95 Euro"; "Standardorder je Trade: 0,95 Euro +
//   0,25 Prozent (Orderprovision: mindestens 0,95 Euro)"; "Depotführung
//   S-Neo: kostenfrei". The detailed PLV is shown only at account opening.
//   MBS runs S-Neo on a Deka S Broker DepotPlus
//   (https://www.sparkasse.de/klp/alp/s-neo/deka-sparkassen.html). For those
//   Sparkassen biallo prints the S-Neo price as 0.95 € with the footnote
//   "bei Handel über Tradegate Exchange, sonst 0,95 € + 0,25 %"
//   (https://www.biallo.de/depot/news/s-neo-sparkasse-im-vergleich/).
//   So the 0.95 € Sofortorder is the Tradegate order and the 0.95 € +
//   0.25 % Standardorder is the order sent elsewhere, not this catalogue.
//   One row, no plans. Tradegate BSX charges no transaction fee and no courtage
//   (../tradegatedirect/tradegateCost.mjs).
//
// A side: 0.95 €. A round trip is 2 × 0.95 € + the Tradegate book once +
// the buy-side FTT from taxMap.mjs (French, Italian, Spanish); UK / Irish
// stamp does not reach a Tradegate trade.
//
// Cash is the Sparkasse Girokonto in euro and every line is euro: no FX.
// Custody is free. Left out: savings plans (free), funds bought from the
// fund company, the Standardorder.
//
//   node brokers/mittelbrandenbur/mittelbrandenbur_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/mittelbrandenbur/mittelbrandenbur_cost.mjs ES0113900J37 Tradegate EUR --shares=100 --price=8.6
//
// `roundTrip(...)` reads files, not the network.

import { tradegateRoundTrip, printCli } from "../tradegatedirect/tradegateCost.mjs";

const SCHEDULE = {
  broker: "Mittelbrandenburgische Sparkasse (S-Neo)",
  folder: "mittelbrandenbur",
  catalogueUrl: new URL("mittelbrandenbur-parsed.json", import.meta.url),
  url: "https://www.mbs.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html",
  readOn: "2026-10-26",
  entity: "Mittelbrandenburgische Sparkasse in Potsdam, S-Neo (S Broker DepotPlus)",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème S-Neo de la MBS (page S-Neo, Sofortorder) relu le 2026-10-26",
  commission: () => ({ eur: 0.95, note: "Sofortorder 0,95 € par ordre" }),
  minBuy: null,
  remark: "",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
