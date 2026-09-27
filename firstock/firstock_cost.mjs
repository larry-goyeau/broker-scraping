// What one round trip costs at Firstock: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://firstock.in/support/charges/ read on 2026-09-26.
//   Delivery brokerage          ₹0, with a minimum of ₹0.01 per contract note
//   STT                         0.10%. The cell does not say sell-only, unlike
//                               the intraday cell, so this is both sides.
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   GST                         18% of brokerage + transaction + SEBI + IPFT
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015%
//   IPFT                        ₹10 / crore on NSE. The page does not print a
//                               BSE figure, so that side is 0.
//   DP on a sell                the off-market line, used for an exchange sell too:
//                               ₹8 + ₹5.50 CDSL, plus GST. The same cell also
//                               says "or ₹25 per transaction"; that alternative
//                               is not a second rate.
// Intraday is another table.
//
//   node firstock/firstock_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const CRORE = 10_000_000;

const SCHEDULE = {
  broker: "Firstock",
  folder: "firstock",
  catalogueUrl: new URL("firstock-parsed.json", import.meta.url),
  url: "https://firstock.in/support/charges/",
  readOn: "2026-09-26",
  brokerageEach: () => 0.01,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? 10 / CRORE : exchange === "BSE" ? 0 : null),
  dpInr: 8 + 5.5,
  basis: "Courtage livraison : minimum 0,01 ₹ par contrat. DP 13,5 ₹ + GST à la vente.",
  remark: "Intraday is the lower of ₹20 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
