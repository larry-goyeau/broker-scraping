// What one round trip costs at GoPocket: buy n shares, sell them back,
// equity delivery, online account, in dollars.
//
// https://www.gopocket.in/ read on 2026-09-29.
//   Standard                     the lower of 0.03% and ₹20 per executed
//                                order. That is the Standard Plan line
//                                labelled Intraday & Delivery.
//                                The FAQ on the same page says equity
//                                delivery is ₹0. That sentence is not the
//                                plan line.
//   Pocket Prime                 0.30% per executed order.
//   STT, stamp, exchange, SEBI,  the page does not reprint them. The
//   GST                          equity-delivery pass-through in force
//                                the same day is used: STT 0.1% on the buy
//                                and on the sell, stamp 0.015% on the buy,
//                                NSE 0.00297%, BSE 0.00375%, SEBI ₹10 /
//                                crore, GST 18% on brokerage, the exchange
//                                charge and SEBI.
//   IPFT                         the page prints no rate, so none is added
//   DP                           the site prints no rupee amount. The CDSL
//                                fiche for DP 92800 does, read on 2026-09-29:
//                                https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=92800
//                                One pay-in, ₹20 plus GST, on both brokerage
//                                plans. There is no second demat scheme.
//
// AMC on that fiche is ₹300 a year and stays out. NRI rates stay out.
// Direct mutual funds are not
// in this catalogue. Intraday, options and call-and-trade stay out.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node gopocket/gopocket_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

function schedule({ brokerageEach, basis }) {
  return {
    broker: "GoPocket",
    folder: "gopocket",
    catalogueUrl: new URL("gopocket-parsed.json", import.meta.url),
    url: "https://www.gopocket.in/",
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
    dpInr: 20,
    basis,
    remark: "",
    rule606: null,
  };
}

const PLANS = {
  standard: schedule({
    brokerageEach: (notional) => Math.min(20, notional * pct("0.03")),
    basis: "Plan Standard : le plus bas de 0,03 % et 20 ₹ par ordre. Pay-in : 20 ₹ + GST.",
  }),
  prime: schedule({
    brokerageEach: (notional) => notional * pct("0.30"),
    basis: "Pocket Prime : 0,30 % par ordre. Pay-in : 20 ₹ + GST.",
  }),
};

export function roundTrip(query) {
  const id = String(query.plan || "standard");
  return indiaRoundTrip(PLANS[id] || PLANS.standard, query);
}

printCli(import.meta.url, roundTrip);
