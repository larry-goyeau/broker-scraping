// What one round trip costs at Groww: buy n shares, sell them back,
// equity delivery, in dollars.
//
// https://groww.in/pricing read on 2026-09-28.
//   Equity brokerage          the lower of ₹20 or 0.1%, and at least ₹5,
//                             inside the SEBI 2.5% cap
//   STT                       0.1% on the buy and on the sell
//   Stamp                     0.015% on the buy
//   Exchange                  NSE 0.00297%, BSE 0.00375%
//   SEBI                      0.0001%
//   IPFT                      NSE 0.0001%. The page prints no BSE rate.
//   GST                       18% on brokerage, DP, exchange, SEBI and IPFT
//   DP on a delivery sell     depository ₹3.50 plus Groww ₹16.50.
//                             Groww's ₹16.50 is ₹0 when the sell is under ₹100.
//                             The depository charge is ₹3.25 for women.
//
// Intraday uses the same brokerage sentence. Equity futures and options,
// and commodities, are ₹20 per executed order. Exchange and government
// charges on those orders are not printed as Groww's own rates, so they
// stay out of the ticket. GST at 18% is printed on the brokerage.
//
// US stocks are a separate account. Groww says ViewTrade Securities, Inc.
// manages it (SEC 8-51605, FINRA CRD 46987) and Apex Clearing Corporation
// clears and custodies it. The catalogue has no US line, so no Rule 606
// mix is applied.
//
//   https://groww.in/pricing
//   https://groww.in/commodities
//   https://groww.in/help/payments-&-withdrawals/payments-charges/what-fees-does-groww-charge--58
//   https://groww.in/help/us-stocks/my-us-stocks-account/where-is-my-us-stocks-account-held--who-is-responsible-for-custody-and-clearing--91
//
//   node brokers/groww/groww_cost.mjs RELIANCE NSE INR --shares=10 --price=1400
//
// `roundTrip(...)` reads files, not the network.

import { indiaRoundTrip, printCli, pct, sebiRate } from "../../indianDelivery.mjs";
import { toUsd } from "../../fx.mjs";
import { finite } from "../../na.mjs";

const SEBI_CAP = 0.025;

function brokerageEach(notional) {
  const ticket = Math.min(20, Math.max(5, notional * pct("0.1")));
  return Math.min(ticket, notional * SEBI_CAP);
}

function dpInr(notional) {
  return 3.5 + (notional < 100 ? 0 : 16.5);
}

const SCHEDULE = {
  broker: "Groww",
  folder: "groww",
  catalogueUrl: new URL("groww-parsed.json", import.meta.url),
  url: "https://groww.in/pricing",
  readOn: "2026-09-28",
  brokerageEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  gstOnDp: true,
  ipftRate: (exchange) => (exchange === "NSE" ? pct("0.0001") : 0),
  dpInr,
  basis:
    "Courtage livraison : le plus bas de 20 ₹ et 0,1 %, au moins 5 ₹, plafond SEBI. DP 3,50 ₹ + 16,50 ₹ à la vente, 16,50 ₹ offerts sous 100 ₹.",
  remark: "Discount ₹0.25 for women.",
  rule606: null,
};

const ORDER_INR = 20;

function derivativeTrip(out) {
  const ticket = ORDER_INR * 2;
  const inr = ticket * (1 + SCHEDULE.gstRate);
  const brokerFees = toUsd(inr, "INR");
  return {
    usd: null,
    brokerFees: finite(brokerFees == null ? null : Number(brokerFees.toPrecision(12)), 6),
    ccy: out.ccy,
    etf: out.etf,
    place: out.place,
    currency: out.currency,
    onlineBuy: true,
    cashCurrency: "INR",
    url: out.url,
    remark: "",
    listing: out.listing,
    basis: `dérivés, page relue le ${SCHEDULE.readOn} : 20 ₹ par ordre exécuté, GST 18 %`,
    why: `aucun carnet pour ${out.listing.exchange} : pas de source de spread`,
    commission: { each: ORDER_INR, currency: "INR" },
  };
}

export function roundTrip(query) {
  const out = indiaRoundTrip(SCHEDULE, query);
  if (out.listing && out.listing.type !== "EQ") return derivativeTrip(out);
  return out;
}

printCli(import.meta.url, roundTrip);
