// What one round trip costs in Chime Invest (self-directed; brokerage
// accounts held at Atomic Brokerage LLC): buy n shares at price p, sell them
// back at once, in the Chime app, in regular hours, in dollars. The 500 US
// stocks and ETFs of the catalogue. Managed Portfolios stay out.
//
// Read 2026-10-26:
//   https://www.chime.com/invest/
//   https://www.chime.com/policies/chime/fees-info/
//
//   commission      $0 each way: "Trading stocks and ETFs is commission-free;
//                   other fees and expenses may apply"; FAQ "There are no
//                   commission fees on trades", "no account opening or
//                   maintenance fees"; fees page "No commission fees".
//   SEC / TAF / CAT SEC and TAF added at the regulators' rates on the sale,
//                   rounded up to the cent (none is printed; owner,
//                   2026-10-28). CAT: no rate printed, 0.
//   Atomic schedule Atomic Brokerage's "Schedule of Maximum Charges" (as of
//                   2024-06-05) caps a US stock order at $5.00 and an
//                   individual account at $3.00 a month, for partners that
//                   charge them; Chime prints no commission and no
//                   maintenance fee, so neither is used.
//                   https://legal.atomicvest.com/usa.broker.schedule.7ea28665-88a9-4542-a748-987e90ea46b6.pdf
//   advisory fee    Managed Portfolios only (0.25% a year, 0.10% Chime Plus,
//                   $0 Chime Prime): not this trip.
//
// Formula: book + 0 + SEC and TAF on the sale. Atomic Brokerage LLC (CRD 315263) files its own
// 606 (2026 Q2: market orders to VIRTU Americas and Citadel Securities,
// payment for order flow "through its clearing firm, RQD* Clearing"),
//   https://cdn.finra.org/606/2026/315263_606_NMS_2026_Q2_V1.pdf
// That PDF's venue split is key `atomic` in spreads/rule606.mjs: the book is
// the blended 605 × that 606's Q.
//
// Cash is dollars (funded from the Chime Checking Account) and every line
// is in dollars: no conversion.
//
//   node brokers/chimeus/chimeus_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/chimeus/chimeus_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Chime Invest",
  folder: "chimeus",
  catalogueUrl: new URL("chimeus-parsed.json", import.meta.url),
  url: "https://www.chime.com/invest/",
  feesPage: "https://www.chime.com/policies/chime/fees-info/",
  readOn: "2026-10-26",
  entity: "Chime Financial (app), Atomic Brokerage LLC (broker-dealer, custody)",
  rule606: "atomic",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "page Chime Invest et page des frais Chime, relues le 2026-10-26 : « Trading stocks and ETFs is commission-free », " +
    "« no account opening or maintenance fees »",
  notes: [
    "barème maximal Atomic Brokerage (5 $ l'ordre, 3 $/mois) non appliqué : Chime n'imprime ni commission ni frais de tenue",
    "606 de Atomic Brokerage (CRD 315263), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
