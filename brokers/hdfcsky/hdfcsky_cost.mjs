// What one round trip costs at HDFC Sky: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://hdfcsky.com/pricing read on 2026-10-12.
//   Equity delivery             the lower of ₹20 and 2.5% per executed order
//   Equity intraday             the same lower of ₹20 and 2.5%
//   ETF delivery and intraday   ₹20 per executed order
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   GST                         18% of brokerage, the exchange charge and SEBI
//   SEBI                        ₹10 per crore of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        the page prints none
//   DP on a delivery sell       ₹20. The GST line does not include it.
// Demat AMC is ₹20 a month after the first year, which is free.
//
//   https://hdfcsky.com/pricing/other-trading-charges
//   https://hdfcsky.com/pricing/demat-account-charges
//   https://hdfcsky.com/pricing/etf-brokerage
//
//   node brokers/hdfcsky/hdfcsky_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const DELIVERY_CAP = 20;
const DELIVERY_RATE = pct("2.5");

function equityEach(notional) {
  return Math.min(DELIVERY_CAP, notional * DELIVERY_RATE);
}

function brokerageEach(notional, row) {
  const isin = String(row?.isin || "").toUpperCase();
  if (isin.startsWith("INF")) return DELIVERY_CAP;
  return equityEach(notional);
}

const SCHEDULE = {
  broker: "HDFC Sky",
  folder: "hdfcsky",
  catalogueUrl: new URL("hdfcsky-parsed.json", import.meta.url),
  url: "https://hdfcsky.com/pricing",
  readOn: "2026-10-12",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: false,
  ipftRate: 0,
  dpInr: 20,
  basis: "Courtage livraison : le plus bas de 20 ₹ et 2,5 % par ordre. Un ETF est 20 ₹. DP 20 ₹ à la vente.",
  remark: "Demat AMC is ₹20 a month after the first year.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
