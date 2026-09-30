// What one round trip costs at Zerodha: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://zerodha.com/charges/ read on 2026-09-25.
//   Delivery brokerage          ₹0
//   STT                         0.1% on the buy and on the sell
//   Transaction charges         NSE 0.00307%, BSE 0.00375%
//   GST                         18% of brokerage + SEBI + transaction charges
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        ₹0.01 / crore, listed apart from the transaction charge
//   DP on a delivery sell       ₹15.34 per scrip, GST already inside
// Direct mutual funds are ₹0 commission and ₹0 DP. Intraday is another table.
//
//   node zerodha/zerodha_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Zerodha",
  folder: "zerodha",
  catalogueUrl: new URL("zerodha-parsed.json", import.meta.url),
  url: "https://zerodha.com/charges/",
  readOn: "2026-09-25",
  freeFund: true,
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  ipftRate: 0.01 / 10_000_000,
  dpInr: 15.34,
  dpIncludesGst: true,
  basis: "Courtage livraison 0. DP 15,34 ₹ par titre à la vente, GST comprise.",
  remark:
    "Intraday is the lower of ₹20 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
