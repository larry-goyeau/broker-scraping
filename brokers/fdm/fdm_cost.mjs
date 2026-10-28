// What one round trip costs at FDM Capital Securities: buy n shares at
// price p, sell them back at once, in dollars. Online trading, PSX ready
// market. Custody stays out.
//
// The home page's "Commission Slab", read on 2026-10-26:
//
//   https://fdm.com.pk/
//
//   "Client Charges Detail" | "Share Price" | "Commission Charged"
//     0.0000 - 20.0000         0.0300     PKR 0.03 a share
//     20.0001 - 99999.9999     0.1500%    of the value
//   The FAQ's older answer, "minimum 5 paisa per share on shares valued up
//   to Rs. 25" (https://fdm.com.pk/faq), is not the slab: the home page's
//   table is used.
//
// Both bands are the PSX floor, max(3 paisa, 0.15 %). FDM prints no
// sales-tax rate; its office is in the PSX Building, Karachi: Sindh SST
// 15 % since 1 July 2024. Nothing says a same-day square pays one side, so
// the trip charges the commission each way and adds no remark.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs. CGT is a tax on the
// gain: out.
//
//   node brokers/fdm/fdm_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/fdm/fdm_cost.mjs KEL PSX PKR --shares=45600 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BANDS = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "fdm",
  brand: "FDM Capital Securities",
  catalogueUrl: new URL("fdm-parsed.json", import.meta.url),
  url: "https://fdm.com.pk/",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "FDM Capital Securities : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % de la valeur au-delà, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  notes: [
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
    "home-page slab used, not the older FAQ answer (5 paisa up to Rs 25)",
    "same-day square not described: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
