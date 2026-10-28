// What one round trip costs in Berliner Sparkasse's S-Neo depot: buy n
// shares on Tradegate BSX and sell them straight back, online, in dollars.
//
// Read 2026-10-26:
//   https://www.berliner-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html
//   "Kauf- und Verkaufsorder an der Börse: 0,95 EUR je Transaktion – zzgl.
//   eventueller Fremdkosten"; Verwahrpreis "0,00 EUR bis 24.999,99 EUR:
//   0,00 %", "ab 25.000,00 EUR: 0,25 %", "Beim Erreichen der Schwelle gilt
//   der jeweils gültige Prozentsatz für das gesamte Depotvolumen."
//   The detailed Preis- und Leistungsverzeichnis is shown only at account
//   opening. The page names no exchange; Tradegate comes from
//   broker-list.json and biallo's footnote to the S-Neo 0.95 € price, "bei
//   Handel über Tradegate Exchange"
//   (https://www.biallo.de/depot/news/s-neo-sparkasse-im-vergleich/).
//   Tradegate BSX charges no transaction fee and no courtage, so the
//   "Fremdkosten" are nil there (../tradegatedirect/tradegateCost.mjs).
//
// A side: 0.95 €. A round trip is 2 × 0.95 € + the Tradegate book once +
// the buy-side FTT from taxMap.mjs (French, Italian, Spanish); UK / Irish
// stamp does not reach a Tradegate trade.
//
// Cash is the Sparkasse Girokonto in euro and every line is euro: no FX.
// Remark: custody 0.25 % a year on the whole depot once it reaches
// 25,000 €. Left out: savings plans (free), funds bought from the fund
// company.
//
//   node brokers/berlinersparkass/berlinersparkass_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/berlinersparkass/berlinersparkass_cost.mjs IE00B4L5Y983 Tradegate EUR --shares=8 --price=107
//
// `roundTrip(...)` reads files, not the network.

import { tradegateRoundTrip, printCli } from "../tradegatedirect/tradegateCost.mjs";

const SCHEDULE = {
  broker: "Berliner Sparkasse (S-Neo)",
  folder: "berlinersparkass",
  catalogueUrl: new URL("berlinersparkass-parsed.json", import.meta.url),
  url: "https://www.berliner-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/s-neo.html",
  readOn: "2026-10-26",
  entity: "Landesbank Berlin AG (Berliner Sparkasse), S-Neo",
  cash: ["EUR"],
  fx: null,
  onlineBuy: true,
  basis: "barème S-Neo de la Berliner Sparkasse (page S-Neo, Preise und Konditionen) relu le 2026-10-26",
  commission: () => ({ eur: 0.95, note: "0,95 € par ordre, sans Fremdkosten à Tradegate" }),
  minBuy: null,
  remark: "Custody 0.25% a year on the whole depot from 25,000 €.",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
