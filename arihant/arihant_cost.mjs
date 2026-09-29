// What one round trip costs at Arihant: buy n shares, sell them back,
// equity delivery, online account, in dollars.
//
// https://www.arihantcapital.com/pricing read on 2026-09-29.
//   Equity delivery          0.30% per executed order. Both plan tables
//                            print 0.30%, and the BTST answer does too.
//                            The charges table below prints "Zero Brokerage"
//                            for delivery. That cell is not the plan rate.
//   STT                      0.1% on the buy and on the sell
//   Stamp                    0.015% on the buy, printed also as ₹1500 / crore
//   Exchange                 NSE 0.00297%, BSE 0.00375%
//   SEBI                     ₹10 / crore
//   IPF                      ₹10 / crore. The cell is not split by exchange.
//   GST                      18% on brokerage, the exchange charge and SEBI.
//                            IPF is outside that line.
//   DP                       a sell moves shares out of the demat account.
//                            The pricing page prints no rupee amount, so
//                            none is added.
//
// Equity delivery is the same 0.30% on both plans, so there is one row.
// Call and trade is zero. AMC depends on the demat plan and stays out.
// Direct mutual funds are not in this catalogue.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node arihant/arihant_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

function brokerageEach(notional) {
  return notional * pct("0.30");
}

const SCHEDULE = {
  broker: "Arihant",
  folder: "arihant",
  catalogueUrl: new URL("arihant-parsed.json", import.meta.url),
  url: "https://www.arihantcapital.com/pricing",
  readOn: "2026-09-29",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: false,
  ipftRate: () => pct("0.0001"),
  dpInr: 0,
  basis: "Courtage livraison : 0,30 % par ordre. Pas de DP chiffré sur la page.",
  remark: "",
  rule606: null,
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
