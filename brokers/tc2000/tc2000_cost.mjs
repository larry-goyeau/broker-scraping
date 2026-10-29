// What one round trip costs at TC2000 Brokerage (TC2000 Brokerage, Inc.,
// CRD 155523, an introducing broker cleared by Interactive Brokers LLC):
// buy n shares at price p, sell them back at once, online on the TC2000
// platform, in regular hours, in dollars. US-listed stocks and ETFs.
//
// Commission page read 2026-10-26 (live text only; the page also carries
// an old commented-out "$25 flat rate for trades over 5,000 shares" and a
// "$4.95 per trade" block that are not shown):
//   https://www.tc2000.com/brokerage/commissions
//   https://www.tc2000.com/brokerage/formcrs
//
//   Small Trader Plan   "Stocks & ETF's $1 + $0.005 per share"
//     (default)         "The Small Trader Plan is the default."
//                       "100 shares = $1.50", "200 shares = $2.00"
//   Active Trader Plan  "Stocks & ETF's $5 + $0.001 per share" (optional,
//                       on request: "Please let us know if you wish to
//                       switch to the Active Trader Plan")
//   No cap or minimum is printed beyond the $1 / $5 fixed part.
//   SEC / TAF / CAT     SEC and TAF added at the regulators' rates on the
//                       sale, rounded up to the cent (the Form CRS: "Direct
//                       fees will be shown on your trade confirmation"; owner,
//                       2026-10-28). CAT: no rate printed, 0.
//
// The two plans price the same trade differently, so each is one row:
// `plan: "small"` (default) and `plan: "active"`.
//
// Formula: book + (fixed + perShare × n) on the buy + the same on the sale.
// A fractional share count (the page's $1,000 trip) is priced per share as
// given.
//
// Routing: "Both plans use IB SmartRouting" and the footer's "Rule 606
// Order Routing Reports" links to Interactive Brokers' reports. The FINRA
// 606 bulk file, 2026 Q2 adopt-by-reference list, has "155523|TC2000
// BROKERAGE, INC.|36418|INTERACTIVE BROKERS LLC" from 2025 Q3. So a US line
// takes IBKR's Q (rule606 key "interactivebrokers").
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only and every line is in dollars: no conversion.
// Margin interest and the software subscription (TC2000 Software Company,
// "not necessary to have a software subscription") are not on an order.
//
//   node brokers/tc2000/tc2000_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/tc2000/tc2000_cost.mjs SPY ARCX USD --shares=1.5 --price=660 --plan=active
//   node brokers/tc2000/tc2000_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, makePlanOf, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "TC2000 Brokerage",
  folder: "tc2000",
  catalogueUrl: new URL("tc2000-parsed.json", import.meta.url),
  url: "https://www.tc2000.com/brokerage/commissions",
  readOn: "2026-10-26",
  entity: "TC2000 Brokerage, Inc. (CRD 155523), cleared by Interactive Brokers LLC (CRD 36418)",
  rule606: "interactivebrokers",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  plans: {
    small: { label: "Small Trader", fixed: 1, perShare: 0.005 },
    active: { label: "Active Trader", fixed: 5, perShare: 0.001 },
  },
  defaultPlan: "small",
  planAlias: { small: "small", smalltrader: "small", default: "small", standard: "small", active: "active", activetrader: "active" },
  ticket: (ctx) => {
    const each = ctx.plan.fixed + ctx.plan.perShare * ctx.shares;
    return { buy: each, sell: each, note: `${ctx.plan.label} : ${ctx.plan.fixed} $ + ${ctx.plan.perShare} $ la part, à l'achat et à la vente` };
  },
  levies: { sec: "up", taf: "up", cat: false },
  basis: (ctx) =>
    `page Commissions TC2000, relue le 2026-10-26 : « Stocks & ETF's $${ctx.plan.fixed} + $${ctx.plan.perShare} per share » (${ctx.plan.label} Plan)`,
  notes: ["TC2000 Brokerage adopte le 606 d'Interactive Brokers par référence (bulk FINRA 2026 T2)"],
};

export const planOf = makePlanOf(SCHEDULE);

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
