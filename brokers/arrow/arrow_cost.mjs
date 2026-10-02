// What one round trip costs at Arrow: buy n shares, sell them back,
// equity delivery, in dollars. The broker is iRage Broking Services LLP.
//
// https://arrow.trade/pricing read on 2026-10-02.
//   Delivery brokerage          ₹0
//   Intraday                    the lower of 0.03% and ₹20 per executed
//                               order. That is another table.
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy, the same figure as
//                               ₹1500 / crore
//   Exchange                    NSE 0.0030699%, BSE 0.00375%
//   SEBI                        0.0001%, which is ₹10 / crore
//   IPFT                        NSE 0.0000001%, which is ₹0.01 / crore.
//                               The cell names no BSE rate.
//   GST                         18% on brokerage, SEBI and the exchange
//                               charge. IPFT is outside that line.
//   DP on a delivery sell       ₹20 per transaction, pay-in to Arrow, plus
//                               GST. The kit is the tariff. An off-market
//                               debit is the higher of ₹20 and 0.03% and
//                               stays out. CDSL charges the participant
//                               ₹3.50 per debit; that line is not added
//                               again. AMC for an individual is nil.
//   https://assets.arrow.trade/documents/compliance/Individual-KYC-form.pdf
//   https://arrow.trade/brokerage-calculator
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node brokers/arrow/arrow_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Arrow",
  folder: "arrow",
  catalogueUrl: new URL("arrow-parsed.json", import.meta.url),
  url: "https://arrow.trade/pricing",
  readOn: "2026-10-02",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0000001") : exchange === "BSE" ? 0 : null),
  gstOnDp: true,
  dpInr: 20,
  basis: "Courtage livraison 0. DP 20 ₹ + GST à la vente, pay-in vers Arrow.",
  remark: "Intraday is the lower of ₹20 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
