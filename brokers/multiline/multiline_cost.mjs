// What one round trip costs at Multiline Securities (MSL Trade): buy n
// shares at price p, sell them back at once, in dollars. Online, PSX ready
// market. Custody stays out.
//
// The "Fee & commission" page (an Angular route; the text sits in the
// chunk main.js loads for it), read on 2026-10-26:
//
//   https://www.msltrade.com/invester-information/feeandcommission
//
//   "Multiline Securities Ltd Commission Structure", "All figures mentioned
//   above are in Pak Rupees":
//     Share price "Upto 20.00"        0.03            PKR 0.03 a share
//     "20.01 - 100.00" and "100.00    "0.15% of Share one cell spanning both
//     and above"                      Value"          rows
//   (the "Roll Over Weekend" column: "applicable on Future's Trading ONLY",
//   out)
//   "Thee same commission rate will be applicable on Delivery as well as
//   Day Trade transactions"; "The Day Trade Commission will be charged on
//   ONE side ONLY": the trip, not squared the same day, pays it each way;
//   the remark gives the same-day saving.
//   "Sind Sales Tax (SST): 13% of Brokerage Commission": older than
//   1 July 2024 (the CGT table is "Year 2021-2022"); MSL is in Karachi, so
//   Sindh SST 15 % is used.
//   "CDC handling charges: Rs: 0.006 per share (on delivery transaction
//   only)": how MSL bills the depository on a delivery, in the broker
//   ticket, in place of the CDC 0.0036 % fee (standardcapital precedent).
//   CDC sub-account Rs 400, UIN Rs 200 and CKO Rs 50 a year, transfers,
//   courier, the Rs 5,000 minimum balance: not per order, out.
//
// Both bands are the PSX floor, max(3 paisa, 0.15 %), at its edge.
//
// Levies (PSX trading fee plus SST, SECP levy, NCCPL), the floor and their
// sources: ../nextcapital/psxCost.mjs. CGT is a tax on the gain: out.
//
//   node brokers/multiline/multiline_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/multiline/multiline_cost.mjs KEL PSX PKR --shares=45600 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BANDS = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "multiline",
  brand: "Multiline Securities",
  catalogueUrl: new URL("multiline-parsed.json", import.meta.url),
  url: "https://www.msltrade.com/invester-information/feeandcommission",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  cdcHandlingPerShare: 0.006,
  plans: {
    online: {
      label: "Online",
      basis:
        "Multiline Securities : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % de la valeur à partir de 20,01 PKR, à chaque sens, plus SST 15 % (la page imprime encore 13 %) ; manutention CDC 0,006 PKR par action à chaque sens",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "page prints SST 13% (older than 1 July 2024): Sindh SST 15% used (Karachi)",
    "day trade charged on one side only (MSL page); this trip is not squared the same day",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
