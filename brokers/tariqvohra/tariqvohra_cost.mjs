// What one round trip costs at Tariq Vohra Securities: buy n shares at
// price p, sell them back at once, in dollars. Online (internet trading),
// PSX ready market. Custody stays out.
//
// The "Schedule of Charges", linked from the home page, read on 2026-10-26:
//
//   https://tvspl.com/pdf/scheduleofcharges.pdf
//
//   "RATE FROM TO | COMMISSION PER SHARE"
//     0        TO 2            0.03   PKR a share
//     2.0001   TO 9.99         0.05   PKR a share
//     9.9901   TO 66.00        0.10   PKR a share
//     66.0001  TO 999,999.99   .15%   of the value
//   "Sind Sales Tax | 13% | Levied on Commission charged": older than
//   1 July 2024; the office is in D.H.A., Karachi, so Sindh SST 15 % is used.
//   The FAQ: "Minimum .03 paisa per share" (https://tvspl.com/faq-2/).
//   Levies printed: "CDC Transaction Fee 0.0004%", "NCCPL Transaction Fee
//   etc. .00322%", "SECP Laga .00065%", "PSX Laga .00350%", "CVT .00%".
//   The NCCPL, SECP and PSX figures are the current ones; the CDC figure is
//   not the depository's current 0.0036 % (Rs 5 to 25,000), which the
//   broker passes on at cost, so the current one is used.
//   CDC custody .005625 % a year, CDC sub-account Rs 400 and UIN Rs 200 a
//   year, rights subscription, the annual CGT fee: not per order, out.
//
// Every band is at or above the PSX floor, max(3 paisa, 0.15 %). The
// schedule says nothing about a same-day square, so the trip charges the
// commission each way and adds no remark.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs. CGT is a tax on the
// gain: out.
//
//   node brokers/tariqvohra/tariqvohra_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/tariqvohra/tariqvohra_cost.mjs KEL PSX PKR --shares=45600 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BANDS = [
  { upTo: 2, perShare: 0.03 },
  { upTo: 9.99, perShare: 0.05 },
  { upTo: 66, perShare: 0.1 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "tariqvohra",
  brand: "Tariq Vohra Securities",
  catalogueUrl: new URL("tariqvohra-parsed.json", import.meta.url),
  url: "https://tvspl.com/pdf/scheduleofcharges.pdf",
  urls: ["https://tvspl.com/faq-2/"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Tariq Vohra Securities : par action 0,03 PKR jusqu'à 2 PKR, 0,05 PKR jusqu'à 9,99 PKR, 0,10 PKR jusqu'à 66 PKR, puis 0,15 % de la valeur, à chaque sens, plus SST 15 % (le barème imprime encore 13 %)",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  notes: [
    "schedule prints SST 13% (older than 1 July 2024): Sindh SST 15% used (Karachi office)",
    "schedule prints CDC 0.0004%: the depository's current 0.0036% (PKR 5 to 25,000) used",
    "same-day square not described: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
