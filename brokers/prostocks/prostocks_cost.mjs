// What one round trip costs at ProStocks: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.prostocks.com/charge-list.html read on 2026-09-26.
//   Delivery brokerage          ₹0
//   STT                         ₹10,000 / crore on the buy and on the sell
//   Transaction                 NSE ₹306.99 / crore, plus IPFT ₹0.01 / crore
//                               BSE ₹375 / crore, no separate IPFT
//   GST                         18% of brokerage + exchange transaction + SEBI
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   DP on a delivery sell       ₹20 + GST per scrip
// The grid is the rate. A paragraph under it still quotes the older NSE
// ₹325 + ₹10 IPFT. There is no US broker-dealer on this page.
//
//   node prostocks/prostocks_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const CRORE = 10_000_000;

const SCHEDULE = {
  broker: "ProStocks",
  folder: "prostocks",
  catalogueUrl: new URL("prostocks-parsed.json", import.meta.url),
  url: "https://www.prostocks.com/charge-list.html",
  readOn: "2026-09-26",
  brokerageEach: () => 0,
  txnRate: (exchange) => (exchange === "NSE" ? 306.99 / CRORE : exchange === "BSE" ? 375 / CRORE : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? 0.01 / CRORE : exchange === "BSE" ? 0 : null),
  dpInr: 20,
  basis: "Courtage livraison 0. DP 20 ₹ + GST par scrip à la vente.",
  remark: "Intraday is ₹15 per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
