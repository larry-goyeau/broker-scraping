// What one round trip costs in Mid Minnesota Federal Credit Union's
// Self-Guided investing (InvestiFi portal in online banking and the app):
// buy n shares at price p, sell them back at once, in regular hours, in
// dollars. US stocks and ETFs, from $1 a transaction. Crypto and the
// Guided (managed ETF) portfolios stay out.
//
// Read 2026-10-26:
//   https://www.mmfcu.org/digital-investing/securities-etfs
//   https://www.bluestonefcu.org/investment-tools/   (same InvestiFi portal)
//   https://files.brokercheck.finra.org/crs_289604.pdf (InvestiFi Form CRS,
//     effective 2025-05-21)
//
//   purchase        $0: "Invest any amount self-guided from $1 to $250,000
//                   per transaction with no purchase fees."
//   sale            $0. The page names no sale fee. The broker is the same
//                   InvestiFi Securities LLC for every credit union on the
//                   portal, and Bluestone FCU's page prints "The cost to
//                   trade securities is free"; InvestiFi's Form CRS says "We
//                   do not charge commissions on trades".
//   SEC / TAF / CAT not printed, so 0.
//
// Formula: book + 0 + 0. Broker InvestiFi Securities LLC (CRD 289604); executing broker
// and custodian RQD Clearing LLC. InvestiFi adopts RQD's 606 by reference:
// key `rqd` in spreads/rule606.mjs, the book is the blended 605 × that 606's
// Q.
//
// Residents of TX, ID and NY cannot trade (client countries, not a line).
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/midminnesotafede/midminnesotafede_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/midminnesotafede/midminnesotafede_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Mid Minnesota Federal Credit Union",
  folder: "midminnesotafede",
  catalogueUrl: new URL("midminnesotafede-parsed.json", import.meta.url),
  url: "https://www.mmfcu.org/digital-investing/securities-etfs",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (broker), RQD Clearing LLC (execution, custody)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "page « Securities & ETFs » de Mid Minnesota FCU, relue le 2026-10-26 : « no purchase fees » ; vente à 0 $ comme sur le " +
    "même portail InvestiFi (Bluestone FCU : « The cost to trade securities is free »)",
  notes: ["606 de RQD* Clearing (CRD 134284), 2026 T2"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
