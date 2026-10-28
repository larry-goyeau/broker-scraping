// What one round trip costs at Rafi Securities: buy n shares at price p,
// sell them back at once, in dollars. Online (Vtrade), PSX ready market.
// Custody stays out.
//
// The "Commission Structure & Charges Details" page, read on 2026-10-26:
//
//   https://rafisecurities.com/commission-structure-charges-detail/
//
//   Commission Structure  "Rs 0.03 per share or 0.15% of the transaction
//                         value, whichever is higher" ("Minimum Commission
//                         by SECP"): the PSX floor, one slab for every
//                         account.
//   Sindh Sales Tax       "13% of Commission": a rate older than 1 July 2024;
//                         Sindh SST on brokerage is 15 % since then (Sindh
//                         Finance Act 2024), so 15 % here. Office "Al-Rahim
//                         Towers, I.I. Chundrigar Road, Karachi".
//   CDC handling          "Rs 0.004 per share on delivery sale/purchase":
//                         how Rafi bills the depository on a delivery, in its
//                         ticket, in place of the CDC 0.0036 % transaction
//                         fee (standardcapital precedent), each side.
//   "The Day Trade Commission would be charged on ONE side ONLY": this trip
//   is not squared the same day, so the commission is each way; the remark
//   gives the same-day saving.
//
// Left out: CDC investor account Rs 1,000, NCCPL UIN Rs 200 and trading
// account maintenance Rs 1,000 a year, the fixed annual NCCPL CGT fee by
// traded-value tier (all per year, not per order); CDC transfer of physical
// shares Rs 0.30 and inward/outward transfers Rs 0.004 a share (not a
// trade); the NCCPL odd-lot charge of Rs 5 a trade (odd lots only); CGT and
// dividend tax (on the gain and the income, not on the trip).
//
// Levies (PSX trading fee plus SST, SECP levy, NCCPL), the floor and their
// sources: ../nextcapital/psxCost.mjs.
//
//   node brokers/rafi/rafi_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//   node brokers/rafi/rafi_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];
const CDC_HANDLING = 0.004;

const cost = makePsxCost({
  folder: "rafi",
  brand: "Rafi Securities",
  catalogueUrl: new URL("rafi-parsed.json", import.meta.url),
  url: "https://rafisecurities.com/commission-structure-charges-detail/",
  urls: ["https://rafisecurities.com/online-trading/"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  cdcHandlingPerShare: CDC_HANDLING,
  plans: {
    online: {
      label: "Online",
      basis:
        "Rafi Securities : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur, à chaque sens, plus SST 15 % (la page imprime encore 13 %, taux d'avant le 1er juillet 2024), plus manutention CDC 0,004 PKR par action à chaque sens",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "Rafi still prints SST 13%: Sindh SST on brokerage is 15% since 1 July 2024, used here",
    "day trade commission one side only (Rafi): this trip pays it each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
