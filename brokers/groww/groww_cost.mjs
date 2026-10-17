// What one round trip costs at Groww: buy n shares, sell them back,
// equity delivery, in dollars. An ETF uses the same equity table.
//
// https://groww.in/pricing/ read on 2026-10-17.
//   Delivery brokerage          the lower of ₹20 and 0.1% per executed
//                               order, and at least ₹5. Below ₹5 the
//                               charge is the lower of ₹5 and 2.5%.
//   https://groww.in/help/stocks,-f&o,-ipo-&-mtf/searchable/how-much-is-the-brokerage
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   Transaction                 NSE 0.00297%. BSE 0.00375% for groups
//                               A, B, E, F, FC, G, GC, W and T; 0.1% for
//                               X, XT and Z; 1% for R, SS, ST and ZP;
//                               0.00345% for every other group. The group
//                               is the series on the catalogue line.
//   SEBI                        0.0001% of turnover
//   IPFT                        NSE 0.0001%. The page prints no BSE rate.
//   GST                         18% of brokerage, DP, the exchange charge,
//                               IPFT and SEBI
//   DP on a delivery sell       depository ₹3.5 plus Groww ₹16.5. Groww's
//                               part is ₹0 when the sell is under ₹100.
//                               A woman's depository debit is ₹3.25.
// Account opening and the annual charge are ₹0. Intraday uses the same
// brokerage and another statutory table. F&O is ₹20 per order.
//
//   node brokers/groww/groww_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const BSE_ONE = new Set(["R", "SS", "ST", "ZP"]);
const BSE_POINT1 = new Set(["X", "XT", "Z"]);
const BSE_375 = new Set(["A", "B", "E", "F", "FC", "G", "GC", "W", "T"]);

function brokerageEach(notional) {
  const capped = Math.min(20, notional * pct("0.1"));
  if (capped >= 5) return capped;
  return Math.min(5, notional * pct("2.5"));
}

function bseTxn(series) {
  const group = String(series || "").trim().toUpperCase();
  if (BSE_ONE.has(group)) return pct("1");
  if (BSE_POINT1.has(group)) return pct("0.1");
  if (BSE_375.has(group)) return pct("0.00375");
  return pct("0.00345");
}

function dpInr(notional) {
  return 3.5 + (notional < 100 ? 0 : 16.5);
}

const SCHEDULE = {
  broker: "Groww",
  folder: "groww",
  catalogueUrl: new URL("groww-parsed.json", import.meta.url),
  url: "https://groww.in/pricing/",
  readOn: "2026-10-17",
  brokerageEach,
  txnRate: (exchange, row) => {
    if (exchange === "NSE") return pct("0.00297");
    if (exchange === "BSE") return bseTxn(row?.series);
    return null;
  },
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  gstOnIpft: true,
  ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0001") : exchange === "BSE" ? 0 : null),
  dpInr,
  basis: "Courtage : le plus bas de 20 ₹ et 0,1 % par ordre, au moins 5 ₹, sinon le plus bas de 5 ₹ et 2,5 %. DP 3,50 ₹ + 16,50 ₹ à la vente (0 ₹ Groww sous 100 ₹). Le débit dépositaire d'une femme est 3,25 ₹.",
  remark: "The depository debit for a woman is ₹0.25 less.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
