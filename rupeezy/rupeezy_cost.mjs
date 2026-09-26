// What one round trip costs at Rupeezy: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://rupeezy.in/pricing read on 2026-09-26.
//   Delivery and ETF            0.1% on the buy and on the sell
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE ₹306.99 / crore, BSE ₹375 / crore
//   GST                         18% of brokerage + transaction + SEBI
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   IPFT                        NSE ₹0.01 / crore, BSE ₹0
//   DP on a delivery sell       ₹25 plus the NSDL ₹4 per debit, GST extra
// Intraday is another table. The ETF delivery row prints the same 0.1%.
//
//   node rupeezy/rupeezy_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const CRORE = 10_000_000;

function brokerageEach(notional) {
  return notional * pct("0.1");
}

const SCHEDULE = {
  broker: "Rupeezy",
  folder: "rupeezy",
  catalogueUrl: new URL("rupeezy-parsed.json", import.meta.url),
  url: "https://rupeezy.in/pricing",
  readOn: "2026-09-26",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? 306.99 / CRORE : exchange === "BSE" ? 375 / CRORE : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? 0.01 / CRORE : exchange === "BSE" ? 0 : null),
  dpInr: 29,
  basis: "Courtage livraison 0,1 % par ordre. DP 29 ₹ + GST à la vente, dont 4 ₹ NSDL.",
  remark: "Intraday is the lower of ₹20 and 0.1% per executed order.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
