// What one round trip costs at Definedge: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.definedgesecurities.com/brokerage-calculator/ read on 2026-10-02.
//   Delivery brokerage          ₹0
//   Intraday                    the lower of 0.03% and ₹18 per executed
//                               order. That is another table.
//   STT, stamp, exchange, SEBI, the page names them and prints only the
//   GST                         SEBI rate, ₹10 / crore. The equity-delivery
//                               pass-through in force the same day is used:
//                               STT 0.1% on the buy and on the sell, stamp
//                               0.015% on the buy, NSE 0.00297%, BSE
//                               0.00375%, GST 18% on brokerage, the exchange
//                               charge and SEBI.
//   IPFT                        the page prints no rate, so none is added
//   DP                          the page prints no rupee debit, so none is
//                               added. AMC stays out.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node brokers/definedge/definedge_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Definedge",
  folder: "definedge",
  catalogueUrl: new URL("definedge-parsed.json", import.meta.url),
  url: "https://www.definedgesecurities.com/brokerage-calculator/",
  readOn: "2026-10-02",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  ipftRate: () => 0,
  dpInr: 0,
  basis: "Courtage livraison 0. Pas de débit DP imprimé.",
  remark: "Intraday is the lower of ₹18 and 0.03% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
