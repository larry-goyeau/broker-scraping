// What one round trip costs at Flattrade: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://flattrade.in/charges/ read on 2026-10-18.
//   Delivery brokerage          NIL
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00307%, BSE 0.00375%. No BSE group
//                               split is printed.
//   GST                         18% of brokerage + transaction + SEBI.
//                               IPFT is not in that list.
//   SEBI                        ₹10 per crore of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        ₹10 per crore of turnover. The page prints
//                               one figure, not an NSE and a BSE one, so it
//                               is used on both.
//   DP on a delivery sell       ₹20 per debit transaction + GST (CDSL's
//                               ₹3.50 is inside the ₹20)
//   Clearance                   NIL
// Intraday brokerage is NIL too. Account opening ₹200 + GST at the first
// pay-in, AMC nil, call-and-trade ₹50 + GST: none of these is per trade.
//
//   node brokers/flattrade/flattrade_cost.mjs RELIANCE NSE INR --shares=10 --price=1167.7

import { indiaRoundTrip, printCli, pct, sebiRate, intradayGap } from "../../indianDelivery.mjs";

const CRORE = 10_000_000;

const SCHEDULE = {
  broker: "Flattrade",
  folder: "flattrade",
  catalogueUrl: new URL("flattrade-parsed.json", import.meta.url),
  url: "https://flattrade.in/charges/",
  readOn: "2026-10-18",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: 10 / CRORE,
  dpInr: 20,
  basis: "Courtage livraison 0. DP 20 ₹ + GST par débit à la vente. IPFT 10 ₹ par crore sur NSE comme sur BSE.",
  remark: [
    intradayGap(0, 0),
  ]
    .filter(Boolean)
    .join(" "),
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
