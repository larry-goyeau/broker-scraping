// What one round trip costs at tradegate.direct (Tradegate AG, Berlin): buy
// n shares on Tradegate BSX, the only place it routes to, and sell them
// straight back, online, in dollars.
//
// Read 2026-10-26:
//   https://tradegate.direct/aktien
//   "0 Euro pro Trade." "Dauerhaft keine Ordergebühren und keine
//   Börsengebühren." "Lediglich marktübliche Spreads können anfallen."
//   "Mindestordervolumen: 500 Euro auf jede Kauf-Transaktion."
//   Preis- und Leistungsverzeichnis, Stand März 2026:
//   https://api.tradegate.direct/recupera/adesso_api/v0/PublicDocuments/pricingPerformance/Download
//   "Orderprovision kostenfrei"; "Mindestordervolumen (nur bei Kauf)":
//   Aktien 500,00 EUR, ETPs 100,00 EUR (Wertpapierhandel); Depotführung and
//   Verrechnungskonto kostenfrei. The exchange itself charges nothing per
//   trade (../tradegatedirect/tradegateCost.mjs).
//
// A side: 0 €. A round trip is the Tradegate book once plus the buy-side
// FTT from taxMap.mjs (French, Italian, Spanish); UK / Irish stamp does
// not reach a Tradegate trade (see tradegateCost.mjs). A buy below 500 €
// (share) or 100 € (ETF, ETC, ETN) is refused: N/A with the reason.
//
// Cash is the euro Verrechnungskonto and every line is euro, so nothing is
// converted (the PLV's 0.40 % FX margin is for foreign dividends only).
// Left out: 2.00 € once on a buy filled in parts (PLV note 7), savings
// plans, Mini Futures, corporate-action fees.
//
//   node brokers/tradegatedirect/tradegatedirect_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/tradegatedirect/tradegatedirect_cost.mjs IE00B4L5Y983 Tradegate EUR --shares=8 --price=107
//   node brokers/tradegatedirect/tradegatedirect_cost.mjs FR0000121014 Tradegate EUR --shares=2 --price=430
//
// `roundTrip(...)` reads files, not the network.

import { tradegateRoundTrip, printCli } from "./tradegateCost.mjs";

const SCHEDULE = {
  broker: "tradegate.direct",
  folder: "tradegatedirect",
  catalogueUrl: new URL("tradegatedirect-parsed.json", import.meta.url),
  url: "https://tradegate.direct/aktien",
  readOn: "2026-10-26",
  entity: "Tradegate AG Wertpapierhandelsbank (Berlin)",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème tradegate.direct (page Aktien et Preis- und Leistungsverzeichnis de mars 2026) relu le 2026-10-26",
  commission: () => ({ eur: 0, note: "0 € par ordre (Orderprovision kostenfrei)" }),
  minBuy: (c) => (c.etp ? 100 : 500),
  remark: "",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
