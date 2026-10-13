// What one round trip costs at IIFL Securities: buy n shares, sell them
// back, equity delivery, in dollars. The company is now IIFL Capital
// Services Limited.
//
// https://www.iiflcapital.com/brokerage-charges read on 2026-10-12.
// The table is the Investor Plan (Online Plus).
//   Delivery brokerage          0.25% per executed order, no minimum
//   Intraday / futures          0.025%
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%, BSE 0.00375%. The page says
//                               rupees per crore and does not print the
//                               figure. These are the cash rates.
//   GST                         18% of brokerage and the exchange charge.
//                               The sentence does not include SEBI.
//   SEBI                        ₹5 per crore of turnover
//   Stamp                       0.015% on the buy. The page points at the
//                               revision of 1 July 2020 and does not
//                               reprint the percent.
//   IPFT                        the page prints none
//   DP on a delivery sell       ₹25 plus GST
// AMC is ₹0 the first year, then ₹250 plus GST a year.
// An ETF is the same delivery rate. The remark is the intraday gap.
//
//   https://help.indiainfoline.com/portal/en/kb/articles/what-is-stt-securities-transaction-tax-29-7-2021
//
//   node brokers/iifl/iifl_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, intradayGap } from "../../indianDelivery.mjs";

const CRORE = 10_000_000;
const DELIVERY_RATE = pct("0.25");
const INTRADAY_RATE = pct("0.025");

function brokerageEach(notional) {
  return notional * DELIVERY_RATE;
}

const SCHEDULE = {
  broker: "IIFL Securities",
  folder: "iifl",
  catalogueUrl: new URL("iifl-parsed.json", import.meta.url),
  url: "https://www.iiflcapital.com/brokerage-charges",
  readOn: "2026-10-12",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: 5 / CRORE,
  gstRate: 0.18,
  gstOnSebi: false,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 25,
  basis: "Courtage livraison : 0,25 % par ordre. DP 25 ₹ + GST à la vente.",
  remark: "AMC is ₹250 plus GST a year from the second year. " + intradayGap(DELIVERY_RATE, INTRADAY_RATE),
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
