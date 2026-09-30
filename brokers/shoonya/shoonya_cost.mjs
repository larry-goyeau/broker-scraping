// What one round trip costs at Shoonya: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://shoonya.com/pricing read on 2026-09-25.
//   Delivery brokerage          ₹0
//   STT from 1 April 2026       0.1% on the buy and on the sell
//   Transaction from 1 March    0.00307% on NSE. BSE A and B group is ₹375 / crore.
//   GST                         18% of brokerage + SEBI + transaction charges
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        ₹0.01 / crore
//   DP                          ₹9 + GST per scrip on the pricing page
// Clearing on NSE and BSE is ₹0. Intraday is another table.
//
//   node shoonya/shoonya_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Shoonya",
  folder: "shoonya",
  catalogueUrl: new URL("shoonya-parsed.json", import.meta.url),
  url: "https://shoonya.com/pricing",
  readOn: "2026-09-25",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: 0.01 / 10_000_000,
  dpInr: 9,
  basis: "Courtage livraison 0. DP 9 ₹ + GST par titre à la vente.",
  remark: "Intraday is the lower of ₹5 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
