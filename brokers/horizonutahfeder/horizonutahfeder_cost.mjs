// What one round trip costs in Horizon Utah Federal Credit Union's "Crypto
// and Securities" portal (InvestiFi's self-directed portal in It'sMe247
// online banking): buy n shares at price p, sell them back at once, in
// regular hours, in dollars. US stocks and ETFs, whole or fractional, from
// $1. Crypto (its own schedule, $0.99 minimum) stays out.
//
// Read 2026-10-26:
//   https://www.myhorizoncu.com/cryptocurrency-and-securities/
//
//   commission      $0 each way: FAQ "How much does it cost to use this?
//                   The cost to trade securities is free."
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 0 + SEC and TAF on the sale. Broker InvestiFi Securities LLC; "RQD is the
// executing broker of trades and custodies assets". InvestiFi adopts
// RQD's 606 by reference: key `rqd` in spreads/rule606.mjs, the book is the
// blended 605 × that 606's Q.
//
// Cash is dollars ("Brokerage services are available only to residents of
// the United States") and every line is in dollars: no conversion.
//
//   node brokers/horizonutahfeder/horizonutahfeder_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/horizonutahfeder/horizonutahfeder_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Horizon Utah Federal Credit Union",
  folder: "horizonutahfeder",
  catalogueUrl: new URL("horizonutahfeder-parsed.json", import.meta.url),
  url: "https://www.myhorizoncu.com/cryptocurrency-and-securities/",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (broker), RQD Clearing LLC (execution, custody)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis: "FAQ de Horizon Utah FCU, relue le 2026-10-26 : « The cost to trade securities is free », 0 $ à l'achat et à la vente",
  notes: ["606 de RQD* Clearing (CRD 134284), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
