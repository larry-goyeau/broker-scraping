// What one round trip costs at Chola Securities (Cholamandalam Securities
// Ltd.): buy n shares, sell them back, equity delivery, online "Do It
// Yourself" account (app and web), in dollars. Two plans bill a different
// delivery brokerage and DP debit, so each is a row (`query.plan`):
//   tradestart  Trade Start, ₹300 + taxes once, upfront. The default.
//   tradeplus   Trade Plus, ₹2,500 + taxes once, upfront.
// The "RM Assist" tab is commented out of the page, so it is not a row.
// The page prints no ETF row: an ETF bills the equity delivery row.
//
// https://www.cholasecurities.com/pricing read on 2026-10-21.
//                               Trade Start          Trade Plus
//   Equity delivery             0.2% + taxes         0.1% + taxes
//                               after ₹0 for the     after ₹0 for the
//                               first 30 days        first 365 days
//   Equity intraday             0.02% + taxes        0.01% + taxes
//   DP Transaction (sell)       the higher of        the higher of
//                               0.02% and ₹30        0.01% and ₹25
//                               per ISIN + taxes     per ISIN + taxes
//   CUSPA                       ₹10 per ISIN         free
//   DP AMC                      free the first year, then ₹250 + taxes a
//                               year (Start); free for life (Plus)
//   The ₹0 period is an offer, not the plan rate ("After the Zero Brokerage
//   offer period, the respective scheme charges will apply"): the remark
//   names it. CUSPA bills only shares bought and not paid for, AMC is a
//   yearly holding fee: neither is in the trip.
//
// Statutory lines. The pricing page prints none; Chola's own brokerage
// calculator does, https://www.cholasecurities.com/calculators/brokerage-calculator
// and /calculators-new/js/calculator-detail.js, read on 2026-10-21 (its
// brokerage and its ~₹18.25 DP are a generic "standard NSE discount-broker
// structure", not Chola's plans, so only the statutory rates are kept):
//   STT                         0.1% on the buy and on the sell
//   Stamp                       0.015% on the buy
//   NSE transaction             0.00297% each side
//   SEBI                        ₹10 per crore
//   GST                         18% on brokerage, the exchange charge, SEBI
//                               and the DP debit
// BSE transaction, https://www.bseindia.com/members/TFEquity.aspx read on
// 2026-10-21: ₹375 per crore (0.00375%) for groups A, B and non-exclusive
// scrips. The catalogue line carries no BSE group, so every BSE line
// takes that rate. IPFT is not printed and stays at 0, as in other files.
//
// In the total: the book, brokerage + GST both ways, the DP debit + GST on
// the sell, STT, stamp, exchange, SEBI and GST on those two. Remarks: the
// plan fee, the ₹0 period, and the same-day sell gap read at this order's
// value (intraday brokerage + GST both ways, STT 0.025% on the sell and
// stamp 0.003% on the buy, as the calculator page prints them, no DP)
// against the delivery trip: "x% lower" is the cut of those delivery
// charges themselves, as in intradayBuySell (../../indianDelivery.mjs). Cash is rupees only (deposits.mjs): every
// line is INR, so no FX.
//
//   node brokers/chola/chola_cost.mjs RELIANCE NSE INR --shares=10 --price=1211.2
//   node brokers/chola/chola_cost.mjs RELIANCE BSE INR --shares=10 --price=1211.2 --plan=tradeplus
//   node brokers/chola/chola_cost.mjs NIFTYBEES NSE INR --shares=1000 --price=263.88
//   node brokers/chola/chola_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, printCli, pct, sebiRate, roundPct } from "../../indianDelivery.mjs";

const PAGE = "https://www.cholasecurities.com/pricing";
const CALCULATOR = "https://www.cholasecurities.com/calculators/brokerage-calculator";
const BSE_FEES = "https://www.bseindia.com/members/TFEquity.aspx";
const READ_ON = "2026-10-21";
const GST = 0.18;
const STT = pct("0.1");
const STAMP = pct("0.015");
const INTRADAY_STT = pct("0.025");
const INTRADAY_STAMP = pct("0.003");

function schedule({ name, delivery, intraday, dpPct, dpMin, freeDays, fee, basis }) {
  const dpInr = (notional) => Math.max(dpMin, notional * pct(dpPct));
  return {
    name,
    delivery,
    intraday,
    dpPct,
    dpMin,
    freeDays,
    fee,
    broker: "Chola Securities",
    folder: "chola",
    catalogueUrl: new URL("chola-parsed.json", import.meta.url),
    url: PAGE,
    readOn: READ_ON,
    brokerageEach: (notional) => notional * pct(delivery),
    txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
    sttRate: STT,
    stampRate: STAMP,
    sebiRate: sebiRate(),
    gstRate: GST,
    gstOnDp: true,
    gstOnIpft: false,
    ipftRate: 0,
    dpInr,
    basis,
    remark: [`₹${fee} + GST once.`, `₹0 brokerage for the first ${freeDays} days.`].join(" "),
  };
}

const PLANS = {
  tradestart: schedule({
    name: "Trade Start",
    delivery: "0.2",
    intraday: "0.02",
    dpPct: "0.02",
    dpMin: 30,
    freeDays: 30,
    fee: "300",
    basis:
      "Trade Start (300 ₹ + taxes une fois) : courtage livraison 0,2 % + GST par ordre. " +
      "DP à la vente : le plus haut de 0,02 % et 30 ₹ par ISIN, + GST. STT, timbre, NSE et SEBI : calculateur Chola ; BSE 375 ₹ / crore.",
  }),
  tradeplus: schedule({
    name: "Trade Plus",
    delivery: "0.1",
    intraday: "0.01",
    dpPct: "0.01",
    dpMin: 25,
    freeDays: 365,
    fee: "2,500",
    basis:
      "Trade Plus (2 500 ₹ + taxes une fois) : courtage livraison 0,1 % + GST par ordre. " +
      "DP à la vente : le plus haut de 0,01 % et 25 ₹ par ISIN, + GST. STT, timbre, NSE et SEBI : calculateur Chola ; BSE 375 ₹ / crore.",
  }),
};

// Same-day sell against the delivery trip at this order's value. The
// exchange and SEBI lines are the same on both, so they cancel.
function sameDay(cost, plan) {
  const notional = Number(cost?.trade?.notional);
  if (!(notional > 0)) return cost;
  const g = 1 + GST;
  const delivery = 2 * notional * pct(plan.delivery) * g + notional * (2 * STT + STAMP) + plan.dpInr(notional) * g;
  const intraday = 2 * notional * pct(plan.intraday) * g + notional * (INTRADAY_STT + INTRADAY_STAMP);
  const gap = Math.round(((delivery - intraday) / notional) * 100 * 100) / 100;
  const cut = gap > 0 ? roundPct((100 * (delivery - intraday)) / delivery) : Math.abs(gap);
  const line = gap ? `Same day sell fees are ${cut}% ${gap > 0 ? "lower" : "higher"}.` : "";
  return { ...cost, remark: [cost.remark, line].filter(Boolean).join(" ") };
}

export function roundTrip(query) {
  const id = String(query.plan || "tradestart");
  const plan = PLANS[id] || PLANS.tradestart;
  return sameDay(indiaRoundTrip(plan, query), plan);
}

function cli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (called && process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          broker: "Chola Securities",
          url: [PAGE, CALCULATOR, BSE_FEES],
          readOn: READ_ON,
          default: "tradestart",
          plans: Object.fromEntries(
            Object.entries(PLANS).map(([id, plan]) => [
              id,
              {
                plan: plan.name,
                fee: `${plan.fee} ₹ + GST une fois`,
                delivery: `${plan.delivery}% + GST par ordre, 0 ₹ les ${plan.freeDays} premiers jours`,
                intraday: `${plan.intraday}% + GST par ordre`,
                dp: `le plus haut de ${plan.dpPct}% et ${plan.dpMin} ₹ par ISIN vendu, + GST`,
                basis: plan.basis,
                remark: plan.remark,
              },
            ])
          ),
          stt: "0.1% achat et vente",
          stamp: "0.015% à l'achat",
          transaction: { NSE: "0.00297%", BSE: "0.00375%" },
          sebi: "10 ₹ / crore",
          ipft: "non publié, 0",
          gst: "18% sur courtage, transaction, SEBI et DP",
        },
        null,
        2
      )
    );
    return;
  }
  const hit = process.argv.find((item) => item.startsWith("--plan="));
  printCli(import.meta.url, (query) => roundTrip({ ...query, plan: hit ? hit.slice("--plan=".length) : query.plan }));
}

cli();
