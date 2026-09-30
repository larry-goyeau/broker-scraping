// What one round trip costs at Choice: buy n shares, sell them back,
// equity delivery, online account, in dollars.
//
// https://choiceindia.com/brokerage-charges read on 2026-09-28.
//   Equity delivery          the lower of 0.20% and ₹20 per executed order.
//                            A ₹50,000 order is charged ₹20, not 0.20%.
//   STT                      0.1% on the buy and on the sell
//   Stamp                    0.015% on the buy
//   Exchange                 NSE 0.00297%, BSE 0.00375%
//   SEBI                     ₹10 / crore
//   NSE IPFT                 ₹10 / crore. The page prints no BSE rate.
//   GST                      18% on brokerage, the exchange charge, SEBI
//                            and the DP debit. IPFT is outside that line.
//   DP on a delivery sell    ₹10 per instruction, plus GST
//
// Offline clients are a different tariff the page does not print, so they
// are not a second row. AMC from the second year stays out.
//
// The catalogue has no US line. Choice Equity Broking does not name a US
// broker-dealer. ChoiceTrade is a different firm. No Rule 606 mix.
//
//   node brokers/choice/choice_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

function brokerageEach(notional) {
  return Math.min(20, notional * pct("0.20"));
}

const SCHEDULE = {
  broker: "Choice",
  folder: "choice",
  catalogueUrl: new URL("choice-parsed.json", import.meta.url),
  url: "https://choiceindia.com/brokerage-charges",
  readOn: "2026-09-28",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0001") : 0),
  dpInr: 10,
  basis: "Courtage livraison : le plus bas de 0,20 % et 20 ₹ par ordre. DP 10 ₹ + GST à la vente.",
  remark: "",
  rule606: null,
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
