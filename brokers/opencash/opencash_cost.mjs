// What one round trip costs at Opencash (Opencash Securities LLC, clearing
// and custody at RQD* Clearing, LLC): buy n shares at price p, sell them
// straight back, in the app, in dollars. US-listed stocks and ETFs, whole or
// fractional. Options stay out.
//
// Fee schedule PDF ("updated March 2026", linked from opencash.com's footer
// as "Fee Schedule"), read in full 2026-10-26:
//   https://opencash.com/ocs_fee_schedule_updated_march_2026.pdf
// Customer Relationship Summary (effective 2025-09-01), read the same day:
//   https://support.opencash.com/article/71-ocs-customer-relationship-summary
//
//   "US Listed (Stocks and ETFs)"   "$0"
//   "Regulatory and TAF"            "$0*", the asterisk: "Opencash Securities
//                                   pays all regulatory (SEC), trading
//                                   activity (FINRA), routing, and clearing
//                                   fees on behalf of customers in
//                                   connection with their trade."
//   CAT                             not printed: 0
//   ACATS outbound $80, wires $30 / $55, returned ACH $35, paper fees: not on
//   an order.
//
// The CRS (September 2025) still says "you pay all Regulatory, Exchange, and
// Clearing Firm fees in connection with your trade", with no rate. The March
// 2026 schedule is newer and says the firm pays them, so they are 0 here (and
// an unprinted rate would be 0 under the owner's rule anyway).
//
// Formula: book (quoted NBBO × shares) + $0 + $0.
//
// Routing: Opencash Securities files no 606 of its own and is not on the
// FINRA 2026 Q2 adopt-by-reference list; its 606 disclosure says "we notify
// our clearing firm, RQD* Clearing, to direct all orders for execution"
// (https://support.opencash.com/article/79-ocs-order-routing-disclosure).
// RQD's 2026 Q2 report is not in the bulk zip; spreads/rule606.mjs reads it
// on FINRA's CDN (key `rqd`): the book is the blended 605 × that 606's Q.
//
// Cash is dollars (ACH and US wires) and every line is in dollars: no
// conversion.
//
//   node brokers/opencash/opencash_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/opencash/opencash_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Opencash",
  folder: "opencash",
  catalogueUrl: new URL("opencash-parsed.json", import.meta.url),
  url: "https://opencash.com/ocs_fee_schedule_updated_march_2026.pdf",
  crs: "https://support.opencash.com/article/71-ocs-customer-relationship-summary",
  readOn: "2026-10-26",
  entity: "Opencash Securities LLC",
  clearing: "RQD* Clearing, LLC (CRD 134284)",
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "barème Opencash Securities (mis à jour en mars 2026), relu le 2026-10-26 : " +
    "« US Listed (Stocks and ETFs) $0 », « Regulatory and TAF $0* » (SEC, FINRA, routage et compensation payés par Opencash)",
  notes: [
    "le CRS de septembre 2025 dit encore que le client paie les frais réglementaires, sans taux ; le barème de mars 2026, plus récent, fait foi",
    "606 de RQD* Clearing (CRD 134284), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
