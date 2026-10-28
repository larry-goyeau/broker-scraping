// What one round trip costs at Next Capital: buy n shares at price p, sell
// them back at once, in dollars. Online (Next Advantage app and desktop
// terminal), PSX ready market. Custody stays out.
//
// The commission schedule ("Schedule of Commission and Other Charges",
// July 2025 form), read on 2026-10-26:
//
//   https://cdn.prod.website-files.com/62135fdbd85a60c2f528095e/6864b9c264b141ab1d14fc99_Commission%20Structure%20-0725.pdf
//
//   "COMMISSION: (Rs. Per share or % of share value)"
//   price 0.01 – 12.00   "0.03 Paisa"   read as PKR 0.03 a share: the
//                                       column is rupees a share, and
//                                       0.03 rupees at Rs 12 is 0.25 %,
//                                       where the next band starts
//   12.01 & above        "0.25%"
//   "Sindh Sales Tax | At Actual - SRB": SST 15 % on the commission.
//   "All CDC Charges", "All NCCPL Charges" "At Actual": the levies below.
//   CVT, WHT "At Actual - ITO, 2001": 0 % on a trade (PSX schedule). SMS
//   "At Cost" and the futures / MTS roll-over: not per order, or other
//   markets, out.
//
// Both bands sit above the PSX floor, max(3 paisa, 0.15 %). The schedule
// says nothing about a same-day square, so the trip charges the commission
// each way and adds no same-day remark.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: psxCost.mjs, next to this file.
//
// CGT is a tax on the gain: out.
//
//   node brokers/nextcapital/nextcapital_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/nextcapital/nextcapital_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "./psxCost.mjs";

const BANDS = [
  { upTo: 12, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0025 },
];

const cost = makePsxCost({
  folder: "nextcapital",
  brand: "Next Capital",
  catalogueUrl: new URL("nextcapital-parsed.json", import.meta.url),
  url: "https://cdn.prod.website-files.com/62135fdbd85a60c2f528095e/6864b9c264b141ab1d14fc99_Commission%20Structure%20-0725.pdf",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis: "Next Capital : 0,03 PKR par action jusqu'à 12 PKR, 0,25 % à partir de 12,01 PKR, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  notes: [
    "schedule prints \"0.03 Paisa\" under \"Rs. Per share\": read as PKR 0.03 a share",
    "same-day square not described by Next Capital: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
