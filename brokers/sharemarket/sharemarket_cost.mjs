// What one round trip costs at Share.Market: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.share.market/charges read on 2026-10-08.
//   Delivery brokerage          the lower of ₹20 or 0.1%, and at least ₹2,
//                               and never above the SEBI 2.5% cap
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.0030699%, BSE 0.00375%
//   GST                         18% of brokerage, the DP debit, exchange,
//                               SEBI and IPFT. Stamp is excluded. STT is not
//                               grossed up.
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        0.0000001% of turnover
//   DP on a delivery sell       ₹18.50 per ISIN when the trade is above ₹300,
//                               otherwise ₹3.50. CDSL is inside that figure.
//                               GST is on top.
// The page prints one equity-delivery line. An ETF fiche takes it. The
// worked bands (2.5% up to ₹80, then ₹2 up to ₹2,000, then the 0.1% / ₹20
// cap) are the broker's own examples.
// https://www.share.market/support/home/fees-and-charges/what-are-the-brokerage-and-regulatory-charges-on-share-market/
// Intraday uses the same brokerage and a different STT and stamp. A
// call-and-trade order is ₹30. Neither is this trip. Account opening and
// custody are nil.
//
//   node brokers/sharemarket/sharemarket_cost.mjs VOLTAS NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const SEBI_CAP = 0.025;

function brokerageEach(notional) {
  const ticket = Math.min(20, Math.max(2, notional * pct("0.1")));
  return Math.min(ticket, notional * SEBI_CAP);
}

function dpInr(notional) {
  return notional > 300 ? 18.5 : 3.5;
}

const SCHEDULE = {
  broker: "Share.Market",
  folder: "sharemarket",
  catalogueUrl: new URL("sharemarket-parsed.json", import.meta.url),
  url: "https://www.share.market/charges",
  readOn: "2026-10-08",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0000001"),
  dpInr,
  basis:
    "Courtage livraison : le plus bas de 20 ₹ et 0,1 %, au moins 2 ₹, plafond SEBI. DP 18,50 ₹ + GST à la vente au-dessus de 300 ₹, sinon 3,50 ₹.",
  remark: "Intraday STT is 0.025% on the sell and stamp is 0.003% on the buy.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
