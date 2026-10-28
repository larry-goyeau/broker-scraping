// What one round trip costs at MRA Securities: buy n shares at price p,
// sell them back at once, in dollars. Online (MRA D-Trade, V Trade, MRA
// Wiqaya), PSX ready market. Custody stays out.
//
// "MRA Securities Limited – Client's Commission Structure" (one sheet for
// MRA, D-Trade and Wiqaya), read on 2026-10-26:
//
//   https://mra.com.pk/downloads/Commission-Structure.pdf
//
//   DEL (ready delivery)    0.01 – 20.00      "0.0300 R" (PKR 0.03 a share)
//                           20.01 – 99999.99  "0.1500 %"
//   DIF (ready difference)  the same slab
//   "Ready / Future Market on Delivery / Intraday Difference: Rs. 0.03 or
//   0.15% or agreed rate which is higher with maximum cap of 2.5% of the
//   transaction value." The 2.5 % is the exchange cap on an agreed rate;
//   the client slab printed is the DEL line, used here.
//   "CDC charges shall be applicable as per the CDC Regulations";
//   "Transaction on fee, Government taxes, or any other charges applicable
//   from time to time shall be billed to client": the levies below.
//   COT, FRL, MF, FDF, FDL: roll-overs and futures, out.
//
// The sheet gives the intraday difference trade the same slab and does not
// say it is one side, so the trip charges the commission each way and adds
// no same-day remark.
//
// MRA prints no sales-tax rate. Office "Room 708-709, 7th Floor, Pakistan
// Stock Exchange Building, Stock Exchange Road, Karachi 74000, Sindh"
// (https://mra.com.pk/): Sindh sales tax, 15 % since 1 July 2024.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs. Both bands are the
// PSX floor.
//
// CGT is a tax on the gain: out.
//
//   node brokers/mra/mra_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/mra/mra_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BANDS = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "mra",
  brand: "MRA Securities",
  catalogueUrl: new URL("mra-parsed.json", import.meta.url),
  url: "https://mra.com.pk/downloads/Commission-Structure.pdf",
  urls: ["https://mra.com.pk/"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "D-Trade",
      basis:
        "MRA Securities, livraison au comptant (DEL) : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % à partir de 20,01 PKR, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  notes: [
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
    "intraday difference trade on the same slab, one side not stated: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
