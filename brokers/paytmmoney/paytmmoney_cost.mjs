// What one round trip costs at Paytm Money: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.paytmmoney.com/stocks/pricing read on 2026-10-12.
// The table is plan D20-I20-F20, the one that page shows signed out.
//   Delivery brokerage          the lower of ₹20 and 2.5% per executed order
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%, BSE 0.00375%
//   GST                         18% of brokerage, SEBI and the exchange charge
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        0.0001% of turnover on NSE. BSE prints none.
//   DP on a delivery sell       ₹20, of which ₹3.50 is CDSL, plus GST
// AMC is ₹0. The first 30 days, up to 10 orders, are not this rate.
// An account still on an older plan pays ₹0.01, or the lower of ₹15 and 2.5%.
//
//   node brokers/paytmmoney/paytmmoney_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate, intradayGap } from "../../indianDelivery.mjs";

// Delivery is what the round trip charges. Intraday is the lower of the
// same ₹20 and 0.05%. The remark is that gap, and the figure stays here.
const DELIVERY_RATE = pct("2.5");
const INTRADAY_RATE = pct("0.05");

function brokerageEach(notional) {
  return Math.min(20, notional * DELIVERY_RATE);
}

const SCHEDULE = {
  broker: "Paytm Money",
  folder: "paytmmoney",
  catalogueUrl: new URL("paytmmoney-parsed.json", import.meta.url),
  url: "https://www.paytmmoney.com/stocks/pricing",
  readOn: "2026-10-12",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0001") : 0),
  dpInr: 20,
  basis: "Courtage livraison : le plus bas de 20 ₹ et 2,5 % par ordre. DP 20 ₹ + GST à la vente.",
  remark:
    "The first 30 days, up to 10 orders, are another rate. " +
    intradayGap(DELIVERY_RATE, INTRADAY_RATE),
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
