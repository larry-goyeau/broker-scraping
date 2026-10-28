// What one round trip costs at TradingBlock (AOS, Inc., Chicago): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US-listed stocks and ETFs. Options, phoned-in orders and margin
// stay out.
//
// Read 2026-10-26:
//   https://www.tradingblock.com/pricing-policies
//
// Two account kinds with their own stock commission, so two plans (one row
// each on the page, `plan: "zero"` the default and `plan: "full"`):
//   ZERO COMMISSION  "Stocks & ETFs $0.00 per online trade"; cleared and
//                    custodied at RQD* Clearing LLC.
//   FULL SERVICE     "$0.001 per share; $5.00 minimum per trade"; cleared
//                    and custodied at Apex Clearing Corporation.
//   phoned-in        "$25.00 per trade + above charges" (Zero Commission),
//                    "$0.00 per trade + above charges" (Full Service): not
//                    online, not this trip.
//
// Regulatory fees, printed on the same page for both accounts:
//   SEC   "$0.00002060 x principal of eligible sales" ("$20.60 for every
//         $1,000,000 of securities sold"). No rounding printed: exact.
//   TAF   "$0.000166 per share with a cap of $8.30 per transaction" (the
//         2025 rate). Charged at FINRA's current rate, which is paused from
//         2026-10-01 to 2026-12-31 (SR-FINRA-2026-021), so $0 today and
//         $0.000195 a share, cap $9.79 after that. No rounding printed.
//   CAT   "$0.000048 / share" ("$0.000013 per share for Historical Fees PLUS
//         $0.000035 per share for Ongoing Fees"). The page does not limit it
//         to sales, so both legs, as the other brokers that pass CAT on. No
//         rounding printed: exact.
// "TradingBlock reserves the right to pass through all regulatory or
// exchange transaction fees assessed per trade": nothing else is quantified.
//
// Formula, each plan: book + commission × 2 + SEC + TAF + CAT × 2.
//
// Routing: AOS publishes its own 606 page and routes "to Apex Clearing
// Corporation ("Apex"), RQD* Clearing, and other brokerage firms"; Apex or
// RQD pick the venues. A Full Service order goes through Apex, so it takes
// Apex's Q ("apex"). A Zero Commission order goes through RQD Clearing,
// whose 2026 Q2 report spreads/rule606.mjs reads on FINRA's CDN: RQD's Q
// ("rqd").
//
// Cash is dollars and every line is in dollars: no conversion. ACAT out
// $75, wires and the IRA fee do not ride on an order.
//
//   node brokers/tradingblock/tradingblock_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/tradingblock/tradingblock_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725 --plan=full
//   node brokers/tradingblock/tradingblock_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, makePlanOf, printCli } from "../wellstrade/usCost.mjs";

const FULL = { perShare: 0.001, min: 5 };
const CAT_PER_SHARE = 0.000048;

const SCHEDULE = {
  broker: "TradingBlock",
  folder: "tradingblock",
  catalogueUrl: new URL("tradingblock-parsed.json", import.meta.url),
  url: "https://www.tradingblock.com/pricing-policies",
  readOn: "2026-10-26",
  entity: "AOS, Inc. (TradingBlock)",
  rule606: null,
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  plans: {
    zero: { label: "Zero Commission", clearing: "RQD* Clearing LLC", rule606: "rqd" },
    full: { label: "Full Service", clearing: "Apex Clearing Corporation", rule606: "apex" },
  },
  defaultPlan: "zero",
  planAlias: { zero: "zero", zerocommission: "zero", free: "zero", full: "full", fullservice: "full", apex: "full", rqd: "zero" },
  ticket: (ctx) => {
    if (ctx.plan?.id === "full") {
      const each = Math.max(FULL.min, FULL.perShare * ctx.shares);
      return { buy: each, sell: each, note: `Full Service : ${FULL.perShare} $ la part, minimum ${FULL.min} $ par ordre, à l'achat et à la vente` };
    }
    return { buy: 0, sell: 0, note: "Zero Commission : 0 $ par ordre en ligne" };
  },
  levies: { sec: "exact", taf: "exact", cat: { perShare: CAT_PER_SHARE, mode: "exact" } },
  basis:
    "page TradingBlock « Pricing & Policies », relue le 2026-10-26 : Zero Commission « $0.00 per online trade », " +
    "Full Service « $0.001 per share; $5.00 minimum per trade », SEC, TAF et CAT refacturées",
  notes: (ctx) => [
    `compte ${ctx.plan?.label} compensé chez ${ctx.plan?.clearing}`,
    ctx.plan?.rule606 === "apex" ? "ordres par Apex : Q d'Apex" : "ordres par RQD Clearing : Q de RQD",
    "TAF imprimée au taux 2025 (0,000166 $, plafond 8,30 $) : taux FINRA courant appliqué",
    "aucun arrondi imprimé pour SEC, TAF et CAT : montants exacts",
  ],
};

export const planOf = makePlanOf(SCHEDULE);

export function roundTrip(query = {}) {
  const plan = planOf(query.plan);
  return usRoundTrip({ ...SCHEDULE, rule606: plan?.rule606 ?? null }, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
