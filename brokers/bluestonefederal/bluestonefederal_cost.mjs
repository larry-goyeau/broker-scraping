// What one round trip costs in Bluestone Federal Credit Union's "My
// Investment Portal" (InvestiFi's self-directed portal in online banking):
// buy n shares at price p, sell them back at once, in regular hours, in
// dollars. US stocks and ETFs, whole or fractional, from $1. Crypto stays
// out (it has its own schedule: $0.99 minimum, 2.99% up to $1,000, 1.75%
// up to $5,000).
//
// Read 2026-10-26:
//   https://www.bluestonefcu.org/investment-tools/
//
//   commission      $0 each way: "How much does it cost to use this? The
//                   cost to trade securities is free."
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 0 + SEC and TAF on the sale. Broker InvestiFi Securities LLC; "RQD is the
// executing broker of trades and custodies assets". InvestiFi adopts
// RQD's 606 by reference: key `rqd` in spreads/rule606.mjs, the book is the
// blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/bluestonefederal/bluestonefederal_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/bluestonefederal/bluestonefederal_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Bluestone Federal Credit Union",
  folder: "bluestonefederal",
  catalogueUrl: new URL("bluestonefederal-parsed.json", import.meta.url),
  url: "https://www.bluestonefcu.org/investment-tools/",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (broker), RQD Clearing LLC (execution, custody)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis: "FAQ de Bluestone FCU, relue le 2026-10-26 : « The cost to trade securities is free », 0 $ à l'achat et à la vente",
  notes: ["606 de RQD* Clearing (CRD 134284), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
