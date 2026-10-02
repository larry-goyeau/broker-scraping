// What one round trip costs at Sahi: buy n shares, sell them back,
// equity delivery, in dollars. The broker is Aaritya Broking Private Limited.
//
// https://www.sahi.com/pricing read on 2026-10-02.
//   Delivery brokerage          the lower of ₹10 and 0.05% per executed
//                               order. The first 30 days are free. That
//                               is not this number.
//   Intraday                    the same lower of ₹10 and 0.05%. That is
//                               another table.
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   Exchange                    the delivery cell is the sell only.
//                               NSE 0.0030699%. BSE is the group line:
//                               A, B, E and T 0.00375%, X, XT and Z 0.1%,
//                               and 0.00345% for a group that line does
//                               not name.
//   SEBI                        0.0001%, which is ₹10 / crore
//   IPFT                        0.0000001% on the buy and on the sell.
//                               The cell names no exchange.
//   GST                         18% on brokerage, the DP debit, the
//                               exchange charge, IPFT and SEBI
//   DP on a delivery sell       ₹13.5 per company, plus GST. Pledge,
//                               demat and the courier stay out. AMC is nil.
//
// The catalogue has no US line, so no Rule 606 mix is applied.
//
//   node brokers/sahi/sahi_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";

function seriesOf(row) {
  const parts = String(row?.raw || "").trim().split(/\s+/);
  const isin = parts.at(-1) || "";
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) return "";
  return parts.at(-2) || "";
}

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.0030699");
  if (exchange !== "BSE") return null;
  const series = seriesOf(row);
  if (["A", "B", "E", "T"].includes(series)) return pct("0.00375");
  if (["X", "XT", "Z"].includes(series)) return pct("0.1");
  if (["R", "SS", "ST", "ZP"].includes(series)) return pct("1");
  return series ? pct("0.00345") : null;
}

const SCHEDULE = {
  broker: "Sahi",
  folder: "sahi",
  catalogueUrl: new URL("sahi-parsed.json", import.meta.url),
  url: "https://www.sahi.com/pricing",
  readOn: "2026-10-02",
  brokerageEach: (notional) => Math.min(10, notional * pct("0.05")),
  txnRate,
  txnSides: () => 1,
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0000001"),
  dpInr: 13.5,
  basis: "Courtage livraison : le plus bas de 10 ₹ et 0,05 % par ordre. DP 13,5 ₹ + GST à la vente.",
  remark: "Intraday is the lower of ₹10 and 0.05% per executed order. The first 30 days of brokerage are free.",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
