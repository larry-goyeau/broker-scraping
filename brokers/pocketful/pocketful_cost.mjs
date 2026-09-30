// What one round trip costs at Pocketful: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.pocketful.in/pricing read on 2026-09-26.
//   Delivery brokerage          ₹0, and the same page bills ₹0.01 per order
//                               on that promotion
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   GST                         18% of brokerage + transaction + SEBI + IPFT
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        0.0001% of turnover, the figure the page prints
//   DP on a delivery sell       ₹13.5 + GST per transaction
// Intraday is another table.
//
//   node pocketful/pocketful_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Pocketful",
  folder: "pocketful",
  catalogueUrl: new URL("pocketful-parsed.json", import.meta.url),
  url: "https://www.pocketful.in/pricing",
  readOn: "2026-09-26",
  brokerageEach: () => 0.01,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0001"),
  dpInr: 13.5,
  basis: "Courtage livraison 0,01 ₹ par ordre. DP 13,5 ₹ + GST à la vente.",
  remark: "Intraday is the lower of ₹20 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
