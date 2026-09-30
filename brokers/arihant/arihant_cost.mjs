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
//   DP                       the pricing page prints no rupee amount. The
//                            CDSL fiche for DP 43000 does, as a pay-in per
//                            demat scheme, read on 2026-09-29:
//                            https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=43000
//                            MLT ₹10, LT1250 ₹11, ELT ₹15, Freedom3K ₹10,
//                            Freedom7K nil. The cell does not add GST.
//                            The general scheme is 0.04% or ₹30 plus
//                            depository charges with no figure, so it is
//                            not a row.
//
// Equity delivery is the same 0.30% on every demat scheme. Call and trade
// is zero. AMC depends on the scheme and stays out.
// Direct mutual funds are not in this catalogue.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node brokers/arihant/arihant_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

function brokerageEach(notional) {
  return notional * pct("0.30");
}

function schedule(dpInr, basis) {
  return {
    broker: "Arihant",
    folder: "arihant",
    catalogueUrl: new URL("arihant-parsed.json", import.meta.url),
    url: "https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=43000",
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
    dpInr,
    basis,
    remark: "",
    rule606: null,
  };
}

const PLANS = {
  mlt: schedule(10, "Courtage livraison : 0,30 % par ordre. Pay-in MLT : 10 ₹."),
  lt1250: schedule(11, "Courtage livraison : 0,30 % par ordre. Pay-in LT1250 : 11 ₹."),
  elt: schedule(15, "Courtage livraison : 0,30 % par ordre. Pay-in ELT : 15 ₹."),
  freedom3k: schedule(10, "Courtage livraison : 0,30 % par ordre. Pay-in Freedom3K : 10 ₹."),
  freedom7k: schedule(0, "Courtage livraison : 0,30 % par ordre. Pay-in Freedom7K : 0 ₹."),
};

export function roundTrip(query) {
  const id = String(query.plan || "mlt");
  return indiaRoundTrip(PLANS[id] || PLANS.mlt, query);
}

printCli(import.meta.url, roundTrip);
