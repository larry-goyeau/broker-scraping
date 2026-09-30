// What one round trip costs at Alice Blue: buy n shares, sell them back,
// equity delivery, online account, in dollars.
//
// https://aliceblueonline.com/pricing read on 2026-09-29.
//   Equity delivery          the lower of 2.5% and ₹20 per executed order.
//                            2.5% and ₹20 are the same rule in both tables.
//   STT                      0.1% on the buy and on the sell
//   Stamp                    0.015% on the buy, printed also as ₹1500 / crore
//   Exchange                 NSE 0.00297%, BSE 0.00375%
//   SEBI                     ₹10 / crore
//   IPFT                     the page prints no rate, so none is added
//   GST                      18% on brokerage, the exchange charge and SEBI.
//                            The DP line adds GST on the ₹15.
//   DP on a delivery sell    ₹15 per scrip, plus GST
//
// One plan. AMC is ₹0 and stays out. Mutual funds are ₹0 and are not in
// this catalogue. Bracket orders and call-and-trade stay out.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node aliceblue/aliceblue_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

function brokerageEach(notional) {
  return Math.min(20, notional * pct("2.5"));
}

const SCHEDULE = {
  broker: "Alice Blue",
  folder: "aliceblue",
  catalogueUrl: new URL("aliceblue-parsed.json", import.meta.url),
  url: "https://aliceblueonline.com/pricing",
  readOn: "2026-09-29",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: () => 0,
  dpInr: 15,
  basis: "Courtage livraison : le plus bas de 2,5 % et 20 ₹ par ordre. DP 15 ₹ + GST à la vente.",
  remark: "",
  rule606: null,
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
