// What one round trip costs at ICICI Direct: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://www.icicidirect.com/brokerage read on 2026-10-12.
// MoneySaver is the default plan. A signed-out page shows that one.
//   Delivery brokerage          0.29% per executed order, no minimum
//   Intraday / futures          0.029%
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%. BSE ₹0.75 per executed order,
//                               except groups X, XC, XD, XT, Z, ZP and P at
//                               0.1%, M, MT and R at 0.0028%, and SS and ST
//                               at 1%. The group is the one on the catalogue
//                               line. A BSE line with no group pays ₹0.75.
//   GST                         18% of brokerage, SEBI and the exchange charge
//   SEBI                        0.0001% of turnover
//   Stamp                       0.015% on the buy
//   IPFT                        the page prints none
//   DP on a delivery sell       ₹20 plus GST. NSDL's first debit and CDSL's
//                               one scrip are the same ₹20.
// Demat AMC is ₹700 a year, or ₹300 on iVALUE. Prime 999 is 0.22%,
// Prime 4,999 is 0.10%, Prime 9,999 is 0.07%. The round trip is MoneySaver.
// A same-day sale on the same exchange, with a flat position, is the
// intraday rate. That gap is the remark.
//
//   https://secure.icicidirect.com/customer/brokerageplans
//
//   node brokers/icici/icici_cost.mjs RELIANCE NSE INR --shares=10 --price=1400

import { indiaRoundTrip, printCli, pct, sebiRate, intradayGap } from "../../indianDelivery.mjs";

// Delivery is what the round trip charges. Intraday is 0.029%. The remark
// is that gap, and the figure stays here.
const DELIVERY_RATE = pct("0.29");
const INTRADAY_RATE = pct("0.029");

function brokerageEach(notional) {
  return notional * DELIVERY_RATE;
}

const BSE_POINT1 = new Set(["X", "XC", "XD", "XT", "Z", "ZP", "P"]);
const BSE_28 = new Set(["M", "MT", "R"]);
const BSE_ONE = new Set(["SS", "ST"]);

function bseGroup(row) {
  return String(row?.group || "").trim().toUpperCase();
}

function bsePercent(group) {
  if (BSE_POINT1.has(group)) return pct("0.1");
  if (BSE_28.has(group)) return pct("0.0028");
  if (BSE_ONE.has(group)) return pct("1");
  return null;
}

const SCHEDULE = {
  broker: "ICICI",
  folder: "icici",
  catalogueUrl: new URL("icici-parsed.json", import.meta.url),
  url: "https://www.icicidirect.com/brokerage",
  readOn: "2026-10-12",
  brokerageEach,
  txnRate: (exchange, row) => {
    if (exchange === "NSE") return pct("0.00297");
    if (exchange !== "BSE") return null;
    return bsePercent(bseGroup(row)) ?? 0;
  },
  txnEach: (exchange, row) => {
    if (exchange !== "BSE") return null;
    return bsePercent(bseGroup(row)) == null ? 0.75 : null;
  },
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 20,
  basis: "Courtage livraison : 0,29 % par ordre. DP 20 ₹ + GST à la vente.",
  remark: "Demat AMC is ₹700 a year, or ₹300 on iVALUE. " + intradayGap(DELIVERY_RATE, INTRADAY_RATE),
};

export function roundTrip(query) {
  return indiaRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
