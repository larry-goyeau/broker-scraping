// What one round trip costs at m.Stock: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.mstock.com/pricing read on 2026-09-29.
//   Equity delivery          ₹10 per executed order
//   STT                      0.1% on the buy and on the sell
//   Stamp                    0.015% on the buy
//   Exchange                 NSE 0.00307%, BSE 0.00375%
//   SEBI                     ₹10 / crore
//   NSE IPFT                 ₹0.01 / crore, already inside the printed
//                            0.00307%. BSE: not applicable.
//   GST                      18% on brokerage, DP, the exchange charge
//                            and SEBI
//   DP on a delivery sell    ₹18 per debit, plus GST
//   The first 30 days are ₹0 brokerage. That waiver is the remark.
//   BSE groups X, XT and Z are 0.10%, and P, ZP, SS and ST are 1%.
//   The listing does not carry the group, so the column rate is used.
//   AMC is ₹0. Direct mutual funds are ₹0 and are not in this catalogue.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node m.stock/m.stock_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SCHEDULE = {
  broker: "m.Stock",
  folder: "m.stock",
  catalogueUrl: new URL("m.stock-parsed.json", import.meta.url),
  url: "https://www.mstock.com/pricing",
  readOn: "2026-09-29",
  brokerageEach: () => 10,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00307") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: false,
  gstOnDp: true,
  ipftRate: () => 0,
  dpInr: 18,
  basis: "Courtage livraison : 10 ₹ par ordre. DP 18 ₹ + GST à la vente.",
  remark: "₹0 brokerage for the first 30 days.",
  rule606: null,
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
