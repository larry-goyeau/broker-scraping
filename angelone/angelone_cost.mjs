// What one round trip costs at Angel One: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.angelone.in/exchange-transaction-charges read on 2026-09-25.
//   Delivery brokerage          the lower of ₹20 or 0.1%, and at least ₹5,
//                               after the first 30 days, within the SEBI cap
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.0030699%
//   BSE group A, B              0.00375%
//   IPFT                        0.0000001%
//   GST                         18%
//   SEBI                        ₹10 / crore
//   Stamp                       0.015% on the buy
//   DP on a delivery sell       ₹20 + GST per equity ISIN
//
//   node angelone/angelone_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate } from "../indianDelivery.mjs";

const SEBI_CAP = 0.025;

function brokerageEach(notional) {
  const ticket = Math.min(20, Math.max(5, notional * pct("0.1")));
  return Math.min(ticket, notional * SEBI_CAP);
}

const SCHEDULE = {
  broker: "Angel One",
  folder: "angelone",
  catalogueUrl: new URL("angelone-parsed.json", import.meta.url),
  url: "https://www.angelone.in/exchange-transaction-charges",
  readOn: "2026-09-25",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.0030699") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: pct("0.0000001"),
  dpInr: 20,
  basis: "Courtage livraison : le plus bas de 20 ₹ et 0,1 %, au moins 5 ₹, plafond SEBI. DP 20 ₹ + GST à la vente.",
  remark: "",
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
