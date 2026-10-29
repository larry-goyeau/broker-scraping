// What one round trip costs in Day Air Credit Union's Self-Directed
// Investment Portal (InvestiFi, in online banking and the app): buy n
// shares at price p, sell them back at once, as market orders (the only
// kind offered) in regular hours, in dollars. US stocks and ETFs. Crypto
// stays out (its FAQ prints "a $6.00 fee per trade" for digital assets).
//
// Read 2026-10-26:
//   https://dayair.org/invest/
//
//   commission      $0 each way: "Trade from a selection of exchange-listed
//                   stocks and ETFs with ... zero commissions on trades —
//                   no fees on purchases." InvestiFi's Form CRS likewise
//                   says it charges no commission on trades.
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 0 + SEC and TAF on the sale. Broker InvestiFi Securities LLC; executing broker
// and custodian RQD Clearing LLC. InvestiFi adopts RQD's 606 by reference:
// key `rqd` in spreads/rule606.mjs, the book is the blended 605 × that 606's
// Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/dayaircreditunio/dayaircreditunio_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/dayaircreditunio/dayaircreditunio_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Day Air Credit Union",
  folder: "dayaircreditunio",
  catalogueUrl: new URL("dayaircreditunio-parsed.json", import.meta.url),
  url: "https://dayair.org/invest/",
  readOn: "2026-10-26",
  entity: "InvestiFi Securities LLC (broker), RQD Clearing LLC (execution, custody)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "page « Invest » de Day Air CU, relue le 2026-10-26 : « zero commissions on trades — no fees on purchases », " +
    "0 $ à l'achat et à la vente ; les 6 $ par ordre de la FAQ visent les cryptoactifs",
  notes: ["606 de RQD* Clearing (CRD 134284), 2026 T2", "ordres au marché seulement, heures normales"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
