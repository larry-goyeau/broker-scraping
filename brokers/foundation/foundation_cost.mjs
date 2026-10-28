// What one round trip costs at Foundation Securities (Foundation EDGE): buy
// n shares at price p, sell them back at once, in dollars. Online (EDGE
// terminal, web portal, app), PSX ready market. Custody stays out.
//
// The "Fee & Commission" page, read on 2026-10-26, prints two accounts,
// both with "Trading Terminal YES" and "Web Trading YES":
//
//   https://www.fsedge.com/fee.php
//
//   "For EDGE Stock Trading Commission Slab"
//                     Edge Value                     Edge Prime
//   0.01 - 1.99       "3 Paisa"                      "3 Paisa"
//   2.00 and above    "3 Paisa or 0.15% Whichever    "5 Paisa or 0.17% Whichever
//                     is higher"                     is higher"
//   Edge Value: opening PKR 25,000, "Trader Assistance NO" (the default
//   here). Edge Prime: opening PKR 300,000, "Trader Assistance YES", and
//   still traded online: `--plan=prime`.
//   CDC PKR 400 and UIN PKR 200 a year (individual): not per order, out.
//
//   https://www.fsedge.com/faqs.php
//     "If I call in to place a order, does my regular commission apply?
//     Yes! We do not charge an extra fee to execute an order for you over
//     the phone." The same slab, whatever the channel.
//
// Foundation prints no sales-tax rate. Head office "Bahria Complex II,
// M.T. Khan Road, Karachi": Sindh sales tax, 15 % since 1 July 2024.
// Neither page says anything about a same-day square, so the trip charges
// the commission each way and adds no same-day remark. Both slabs sit at
// or above the PSX floor.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/foundation/foundation_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/foundation/foundation_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10 --plan=prime
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const VALUE = [
  { upTo: 1.99, perShare: 0.03 },
  { upTo: Infinity, perShare: 0.03, rate: 0.0015 },
];
const PRIME = [
  { upTo: 1.99, perShare: 0.03 },
  { upTo: Infinity, perShare: 0.05, rate: 0.0017 },
];

const cost = makePsxCost({
  folder: "foundation",
  brand: "Foundation Securities",
  catalogueUrl: new URL("foundation-parsed.json", import.meta.url),
  url: "https://www.fsedge.com/fee.php",
  urls: ["https://www.fsedge.com/faqs.php"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    value: {
      label: "Edge Value",
      basis:
        "Foundation Edge Value : 0,03 PKR par action jusqu'à 1,99 PKR, à partir de 2 PKR le plus élevé de 0,03 PKR par action et 0,15 %, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(VALUE, notional, shares, price),
    },
    prime: {
      label: "Edge Prime",
      basis:
        "Foundation Edge Prime : 0,03 PKR par action jusqu'à 1,99 PKR, à partir de 2 PKR le plus élevé de 0,05 PKR par action et 0,17 %, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(PRIME, notional, shares, price),
    },
  },
  planAliases: { "edge-value": "value", "edge-prime": "prime" },
  notes: [
    "no sales-tax rate printed: Sindh SST 15% (Karachi head office)",
    "same-day square not described by Foundation: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
