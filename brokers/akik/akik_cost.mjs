// What one round trip costs at Akik Capital: buy n shares at price p, sell
// them back at once, in dollars. Online (Vtrade desktop, web and app), PSX
// ready market. Custody stays out.
//
// The commission sheet linked from the online-trading page, read on
// 2026-10-26:
//
//   https://akikcapital.com/uploads/files/Commission_Structure.pdf
//   https://akikcapital.com/page-online-trading
//
//   "3 Paisa or 0.15% of the Share Price (whichever is higher) (As per
//   Pakistan stock exchange notice number PSX/N-1258)": the PSX floor,
//   max(Rs 0.03 a share, 0.15 % of the value), each side.
//   "One Sided commission will be charged on intraday Transactions." This
//   trip is not squared the same day, so the commission is each way; the
//   remark gives the same-day saving.
//   "All charges (SECP, LAGA, PTR, NCCPL, CDCPL, PSX and other taxable
//   charges) imposed by relevant regulatory authority will be directly
//   charged to client": the levies, at cost.
//
// Akik prints no sales-tax rate. Office "Quality Arcade, Block 7, Clifton,
// Karachi" (https://akikcapital.com/page-contact-us): Sindh sales tax, 15 %
// since 1 July 2024.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/akik/akik_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//   node brokers/akik/akik_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];

const cost = makePsxCost({
  folder: "akik",
  brand: "Akik Capital",
  catalogueUrl: new URL("akik-parsed.json", import.meta.url),
  url: "https://akikcapital.com/uploads/files/Commission_Structure.pdf",
  urls: ["https://akikcapital.com/page-online-trading"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Akik Capital : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur (PSX/N-1258), à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
    "intraday commission one side only (Akik): this trip pays it each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
