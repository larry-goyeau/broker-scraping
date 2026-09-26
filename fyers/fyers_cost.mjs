// What one round trip costs at FYERS: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://fyers.in/charges-list read on 2026-09-25.
//   Delivery, ETF and MTF       ₹20 or 0.3% per executed order, whichever is lower
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.0030699%, BSE 0.00375%
//   GST                         18% of brokerage + transaction + SEBI + IPFT
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        ₹0.01 / crore
//   DP on a delivery sell       ₹12.5 + GST per scrip
//
//   node fyers/fyers_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

function brokerageEach(notional) {
  return Math.min(20, notional * pct("0.3"));
}

const SCHEDULE = {
  broker: "FYERS",
  folder: "fyers",
  catalogueUrl: new URL("fyers-parsed.json", import.meta.url),
  url: "https://fyers.in/charges-list",
  readOn: "2026-09-25",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: 0.01 / 10_000_000,
  dpInr: 12.5,
  basis: "Courtage livraison : le plus bas de 20 ₹ et 0,3 % par ordre. DP 12,5 ₹ + GST à la vente.",
  remark: "Intraday is the lower of ₹20 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
