// What one round trip costs in Thinkwise Credit Union's Digital Investing
// (InvestiFi's self-directed portal in online and mobile banking): buy n
// shares at price p, sell them back at once, in regular hours, in dollars.
// US stocks and ETFs, whole or fractional, from $1. Crypto (its own fee
// table, $0.49 flat to 1.19%) and Guided Investing (0.50% a year) stay out.
//
// Read 2026-10-26:
//   https://www.thinkwisecu.org/invest
//
//   commission      $0 each way: "Self Directed Commissions $0"; FAQ "How
//                   much does it cost to use this? The cost to trade
//                   securities is free."
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 0 + SEC and TAF on the sale. "Brokerage services are provided by InvestiFi
// Securities LLC and RQD* Clearing LLC"; RQD is the custodian. InvestiFi
// adopts RQD's 606 by reference: key `rqd` in spreads/rule606.mjs, the book
// is the blended 605 × that 606's Q.
//
// Cash is dollars ("available only to residents of the United States") and
// every line is in dollars: no conversion.
//
//   node brokers/thinkwisecreditu/thinkwisecreditu_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/thinkwisecreditu/thinkwisecreditu_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Thinkwise Credit Union",
  folder: "thinkwisecreditu",
  catalogueUrl: new URL("thinkwisecreditu-parsed.json", import.meta.url),
  url: "https://www.thinkwisecu.org/invest",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (broker), RQD Clearing LLC (clearing, custody)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "page Invest de Thinkwise CU, relue le 2026-10-26 : « Self Directed Commissions $0 », " +
    "« The cost to trade securities is free », 0 $ à l'achat et à la vente",
  notes: ["606 de RQD* Clearing (CRD 134284), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
