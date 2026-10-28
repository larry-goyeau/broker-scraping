// What one round trip costs at Plum Money CY (Plum's Cyprus entity, CySEC
// licence 407/21): buy n NYSE shares at price p, sell them back at once, in
// the Plum app, in dollars. "Stock Investing (US Shares & Fractional)",
// orders "executed via Alpaca Securities LLC". One row per plan
// (`query.plan`), since the trade fee and the FX fee change with it.
//
// Costs and Charges Disclosure (2026), read in full 2026-10-26:
//   https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf
//   https://withplum.com/en-cy/legal/fees          (linked "Costs & Charges Disclosure")
//   https://withplum.com/en-cy/subscriptions
//
//                 Basic   Pro     Boost   Premium Max
//   FX (EUR/USD)  0.25%   0.25%   0.12%   0.10%   0.10%  "Per trade", "Includes markup"
//   trade fee     €1.00   €0.30   €0.05   €0.00   €0.00  "Per trade", "First 2 trades
//                                                        are free (lifetime)": not this trip
//   SEC           "$8.00 per $1M" on sells, "Min $0.01 per trade"
//   FINRA TAF     "$0.000195/share" on sells, "Min $0.01, max $5.95 per trade"
//   CAT           "~$0.0000265/share", "Buys & Sells"
//   monthly       €0 / €3.99 / €7.99 (€8.99 FR) / €9.99 / €11.99 ("France only")
//
// Their worked "$1,000 ... (buy & sell)" example (10 shares at $100, every
// regulatory line $0.01) gives $7.04 / $5.64 / $2.54 / $2.04 / $2.04, and
// this file gives the same broker part. SEC and TAF are passed at cost, so
// the current rates of usCost.mjs are used (SEC $20.60 per $1M, TAF paused
// from 2026-10-01 to 2026-12-31, FINRA cap $9.79), not the stale $8 /
// $5.95 they print; each rounded up to the cent as their "Min $0.01". CAT
// is their printed rate, both legs, rounded up to the cent as in their
// example (10 × $0.0000265 → $0.01).
//
// Max is left out as a row: France only, same FX and trade fee as Premium,
// a dearer subscription. The fees page shows Pro at "€2" a month; the PDF
// and the subscriptions page say €3.99, which the remark carries. The
// subscriptions page prints Boost trading at "0.5€ / trade"; the PDF table
// and its worked example say €0.05, which is used.
//
// Cash is euros (deposits.mjs: plum eu ["EUR"]; the fee page's deposits and
// minimums are in euros) and every NYSE line is in dollars, so the plan's
// FX % sits in the total on both legs.
//
// Formula: book (605 × Alpaca's Q) + 2 × ticket + 2 × FX % × notional
//          + SEC + TAF on the sale + CAT on both legs.
//
// Routing: Alpaca Securities LLC, named in the PDF and the order handling
// policy; rule606 key "alpaca" (the plum folder is aliased to it too).
//
//   node brokers/plummoneycy/plummoneycy_cost.mjs JPM XNYS USD --shares=3 --price=300
//   node brokers/plummoneycy/plummoneycy_cost.mjs KO XNYS USD --shares=14 --price=70 --plan=premium
//   node brokers/plummoneycy/plummoneycy_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, makePlanOf, printCli } from "../wellstrade/usCost.mjs";

const PDF = "https://withplum.com/api/files/file/EU%202026%20Costs%20and%20Charges.pdf";

const PLANS = {
  basic: { label: "Basic", ticket: 1, fx: 0.0025, monthly: 0 },
  pro: { label: "Pro", ticket: 0.3, fx: 0.0025, monthly: 3.99 },
  boost: { label: "Boost", ticket: 0.05, fx: 0.0012, monthly: 7.99, monthlyFr: 8.99 },
  premium: { label: "Premium", ticket: 0, fx: 0.001, monthly: 9.99 },
};

function remarkOf(plan) {
  if (!plan?.monthly) return "";
  return plan.monthlyFr
    ? `Plan costs €${plan.monthly} a month (€${plan.monthlyFr} in France).`
    : `Plan costs €${plan.monthly} a month.`;
}

const SCHEDULE = {
  broker: "Plum Money CY",
  folder: "plummoneycy",
  catalogueUrl: new URL("plummoneycy-parsed.json", import.meta.url),
  url: PDF,
  page: "https://withplum.com/en-cy/legal/fees",
  readOn: "2026-10-26",
  entity: "Plum Money CY Limited (CySEC 407/21), execution Alpaca Securities LLC",
  rule606: "alpaca",
  cash: "EUR",
  deposits: ["EUR"],
  feeCurrency: "EUR",
  plans: PLANS,
  defaultPlan: "basic",
  planAlias: { basic: "basic", eu: "basic", pro: "pro", boost: "boost", euboost: "boost", premium: "premium", max: "premium", eumax: "premium" },
  ticket: (ctx) => ({
    buy: ctx.plan.ticket,
    sell: ctx.plan.ticket,
    note: `${ctx.plan.label} : trade fee ${ctx.plan.ticket} € par ordre (2 ordres offerts à vie, hors de ce trajet)`,
  }),
  levies: { sec: "up", taf: "up", cat: { perShare: 0.0000265, mode: "up" } },
  remark: (ctx) => remarkOf(ctx.plan),
  basis: (ctx) =>
    `Costs and Charges Disclosure 2026 de Plum Money CY, relue le 2026-10-26 : formule ${ctx.plan.label}, ` +
    `trade fee ${ctx.plan.ticket} € et FX ${Number((ctx.plan.fx * 100).toFixed(2))} % par ordre, SEC / TAF / CAT répercutées`,
  notes: [
    "Alpaca Securities LLC nommée dans le barème : Q d'Alpaca",
    "SEC et TAF aux taux courants (le PDF imprime encore 8 $ par million et un plafond TAF de 5,95 $)",
    "Max non retenu comme ligne : France seulement, mêmes frais que Premium",
  ],
};

export const planOf = makePlanOf(SCHEDULE);

export function roundTrip(query = {}) {
  const plan = planOf(query.plan);
  return usRoundTrip(plan ? { ...SCHEDULE, fx: { rate: plan.fx } } : SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
