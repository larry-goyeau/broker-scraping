// What one round trip costs at Muhammad Munir Muhammad Ahmed Khanani
// Securities (Trade Cast): buy n shares at price p, sell them back at once,
// in dollars. Online, PSX ready market. Custody stays out.
//
// The commission slab linked from the site, read on 2026-10-26:
//
//   https://munirkhanani.com/wp-content/uploads/2024/09/commission-slab-mmk.pdf
//
//   "Commission Slab as prescribed by PSX"
//     0       20         "0.03 Paisa"   (a share)
//     20.01   99999.99   "0.15%"
//
// "0.03 Paisa" is read as Rs 0.03 (3 paisa) a share: the slab says it is
// the one "prescribed by PSX", whose floor is 3 paisa a share or 0.15 %
// (abbasi prints the same "0.03 paisa" and its RDA sheet "Rs. 0.03"). Up to
// Rs 20 three paisa a share is at least 0.15 %, above Rs 20 0.15 % is at
// least three paisa: the slab is the PSX floor itself.
//
// The sheet prints no sales tax and nothing on a same-day square: the trip
// charges the commission each way and adds no same-day remark. Office on
// "Stock Exchange Road, Karachi": Sindh sales tax, 15 % since 1 July 2024.
// The PMEX slab (commodities) is another market: out.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/munirkhanani/munirkhanani_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/munirkhanani/munirkhanani_cost.mjs KEL PSX PKR --shares=45000 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "munirkhanani",
  brand: "Munir Khanani Securities",
  catalogueUrl: new URL("munirkhanani-parsed.json", import.meta.url),
  url: "https://munirkhanani.com/wp-content/uploads/2024/09/commission-slab-mmk.pdf",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Munir Khanani (barème « prescribed by PSX ») : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % de la valeur à partir de 20,01 PKR, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  notes: [
    "\"0.03 Paisa\" read as Rs 0.03 a share (the PSX floor the sheet says it follows)",
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
    "same-day square not described: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
