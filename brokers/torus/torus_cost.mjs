// What one round trip costs at Torus Digital (Torus Financial Markets): buy
// n shares, sell them back, equity delivery, online, in dollars. An ETF uses
// the same equity table.
//
// https://www.torusdigital.com/brokerage-charges read on 2026-10-18. The
// page prints no effective date.
//   Delivery brokerage          flat ₹11 per executed order, buy and sell
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00322%, BSE 0.00375%. No BSE group
//                               table is printed.
//   GST                         18% of brokerage + SEBI + transaction charges
//   SEBI                        ₹10 / crore of turnover
//   Stamp                       0.015% (₹1,500 / crore) on the buy
//   IPFT                        ₹10 / crore + GST, printed "by NSE" only.
//                               The page prints no BSE rate.
//   DP on a delivery sell       ₹11 plus GST per scrip, whatever the
//                               quantity sold (shared by CDSL and Torus)
// Account opening and AMC are ₹0 (BSDA or not). Intraday is ₹11 an order
// with STT 0.025% on the sell only: another table, whose gap to this trip
// is the remark (intradayBuySell). An order placed through
// the contact-centre dealer is ₹100 more: not the online trip.
//
//   node brokers/torus/torus_cost.mjs RELIANCE NSE INR --shares=10 --price=1211.2
//   node brokers/torus/torus_cost.mjs INE002A01018 BSE INR --shares=10 --price=1211.2
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, intradayBuySell, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

const SCHEDULE = {
  broker: "Torus Digital",
  folder: "torus",
  catalogueUrl: new URL("torus-parsed.json", import.meta.url),
  url: "https://www.torusdigital.com/brokerage-charges",
  readOn: "2026-10-18",
  brokerageEach: () => 11,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00322") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  gstOnIpft: true,
  ipftRate: (exchange) => (exchange === "NSE" ? 10 / 10_000_000 : exchange === "BSE" ? 0 : null),
  dpInr: 11,
  basis: "Courtage livraison 11 ₹ par ordre exécuté, à l'achat et à la vente. DP 11 ₹ + GST par titre à la vente.",
  remark: "",
};

export function roundTrip(query) {
  return intradayBuySell(indiaRoundTrip(SCHEDULE, query), SCHEDULE, () => 11);
}

printCli(import.meta.url, roundTrip);
