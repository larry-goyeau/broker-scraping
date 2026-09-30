// What one round trip costs at TradeSmart: buy n shares, sell them back,
// equity delivery, online account, in dollars.
//
// https://tradesmartonline.in/ read on 2026-09-29.
//   Value                        0.07% per executed order. No monthly fee.
//   Power                        ₹15 per executed order. No monthly fee.
// https://tradesmartonline.in/help/demat-account-queries/statutory-charges-levied/
//   updated 30 September 2024.
//   STT                      0.1% on delivery. The sell-only note is for
//                            intraday, futures and options.
//   Stamp                    0.015% on the buy
//   Exchange                 NSE turnover and IPFT together, 0.0030699%.
//                            BSE cash 0.00375%. A note below lists other
//                            rates by BSE group. The delivery footnote is
//                            the rate used here.
//   SEBI                     0.0001%
//   IPFT                     included in the NSE turnover figure, so none
//                            is added again
//   GST                      18% on brokerage, turnover charges and SEBI
// https://tradesmartonline.in/help/others/where-can-i-find-a-list-of-all-the-charges-applicable/
//   DP on a delivery sell    ₹15 plus GST. Off-market is ₹25 plus GST and
//                            is not this sale.
//
// Demat AMC is ₹300 plus GST a year and stays out. Call and trade stays
// out. Direct mutual funds are not in this catalogue.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node brokers/tradesmart/tradesmart_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

function schedule({ brokerageEach, basis }) {
  return {
    broker: "TradeSmart",
    folder: "tradesmart",
    catalogueUrl: new URL("tradesmart-parsed.json", import.meta.url),
    url: "https://tradesmartonline.in/",
    readOn: "2026-09-29",
    brokerageEach,
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: pct("0.1"),
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnIpft: false,
    gstOnDp: true,
    ipftRate: () => 0,
    dpInr: 15,
    basis,
    remark: "",
    rule606: null,
  };
}

const PLANS = {
  value: schedule({
    brokerageEach: (notional) => notional * pct("0.07"),
    basis: "Plan Value : 0,07 % par ordre. Pay-in : 15 ₹ + GST.",
  }),
  power: schedule({
    brokerageEach: () => 15,
    basis: "Plan Power : 15 ₹ par ordre. Pay-in : 15 ₹ + GST.",
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "value");
  return indiaRoundTrip(PLANS[id] || PLANS.value, query);
}

printCli(import.meta.url, roundTrip);
