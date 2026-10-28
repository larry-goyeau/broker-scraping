// What one round trip costs at WE Financial Services (WEonline.biz): buy n
// shares at price p, sell them back at once, in dollars. Online (Vtrade),
// PSX ready market. Custody stays out.
//
// The "Commision Structure" page, read on 2026-10-26, prints no rate of
// its own: "WE are providing standard commission as guided in following
// document of PSX", a link to the exchange's notice on the standard range
// of brokerage commission (PSX/N-1258, 9 October 2019, a scanned PDF; same
// text as the notice adam_cost.mjs quotes):
//
//   https://weonline.biz/WENEW/commission.php
//   https://www.weonline.biz/downloads/PSXSLAB.pdf
//
//   Ready Market – Normal       "3p or 0.15% whichever is higher", on every
//                               buy and sell not squared the same day
//   Ready Market – Intra-Day    the same, on one side only
//   Squared
//   "The prescribed range is from 3 Paisa per share or 0.15% of the
//   transaction value, whichever is higher, up to 2.5% of the transaction
//   value"; "Commission is exclusive of levies."
//   The FAQ: "You can trade from as low* as 3 paisa. For further details
//   please consult our commission structure."
//   https://weonline.biz/WENEW/faq.php
//
// A range left to the broker is a published tariff and takes its maximum
// (owner rule, adam precedent): 2.5 % of the value, each way. Below Rs 1.20
// a share the exchange minimum of 3 paisa a share is above 2.5 %; the
// minimum wins there (applyFloor).
//
// Sales tax: the FAQ still says "Federal Excise Duty @ 16% on Commission",
// a federal duty Sindh's sales tax on services replaced. WE is in the PSX
// Building, Karachi: Sindh SST 15 % since 1 July 2024.
//
// Share transfers (Rs .01 a share in and out), physical deposits and right
// subscriptions are not trades: out. "no fees applicable to maintain a
// WEonline.biz account".
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs. CGT is a tax on the
// gain: out.
//
//   node brokers/wefinancialservi/wefinancialservi_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/wefinancialservi/wefinancialservi_cost.mjs WTL PSX PKR --shares=290000 --price=0.96 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, SALES_TAX } from "../nextcapital/psxCost.mjs";

// Top of the exchange's standard range, of the traded value, each side.
const RATE = 0.025;

const cost = makePsxCost({
  folder: "wefinancialservi",
  brand: "WE Financial Services",
  catalogueUrl: new URL("wefinancialservi-parsed.json", import.meta.url),
  url: "https://weonline.biz/WENEW/commission.php",
  urls: ["https://www.weonline.biz/downloads/PSXSLAB.pdf", "https://weonline.biz/WENEW/faq.php"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  applyFloor: true,
  plans: {
    online: {
      label: "Online",
      basis:
        "WE Financial Services renvoie à la fourchette PSX (PSX/N-1258) : de max(0,03 PKR par action, 0,15 %) jusqu'à 2,5 % ; maximum retenu, 2,5 % à chaque sens (au moins 0,03 PKR par action), plus SST 15 %",
      side: ({ notional }) => ({ each: notional * RATE, band: { rate: RATE } }),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "WE publishes only the PSX standard range (3 paisa or 0.15% up to 2.5%): maximum 2.5% each way taken (owner rule for a discretionary range)",
    "FAQ still names Federal Excise Duty 16%: Sindh SST 15% used (Karachi office)",
    "intra-day squared trade: one side (PSX/N-1258)",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
