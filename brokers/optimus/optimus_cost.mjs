// What one round trip costs at Optimus Capital Management (Optimus Trade):
// buy n shares at price p, sell them back at once, in dollars. Online
// (mobile app and desktop application), PSX ready market. Custody stays out.
//
// The "Commission Structure" page and its PDF, read on 2026-10-26, print one
// rate for a share trade:
//
//   https://optimus.pk/commission-structure/
//   https://optimus.pk/wp-content/uploads/Commission_structure_optimus.pdf
//
//   "3 Paisa or 0.15% of the share Price (Whichever is higher) (As per
//   Pakistan Stock Exchange, notice Number PSX/N-1258)"
//   "The above rates are exclusive of Government Levies and Taxations"
//   "CDC charges shall be applicable as per the CDC Regulations."
//   "Transaction on fee, Government taxes, or any other charges applicable
//   from time to time shall be billed to client."
//   Weekly rollover commission and mark-to-market: futures, out.
//
// "0.15% of the share Price" is read as 0.15 % of the traded value, as the
// PSX notice it cites prints it ("3p or 0.15% whichever is higher" of the
// transaction value). That notice (PSX/N-1258, read for adam on 2026-10-26:
// https://adamsecurities.com.pk/uploads/files/Commission_Slabs.pdf) charges
// a trade squared the same day "On one side – either on buy side or sell
// side trade": the remark. This trip is not squared the same day, so the
// commission is each way. The rate is the PSX floor itself.
//
// Optimus prints no sales-tax rate. Registered office "1st Floor, State Life
// Building No. 1-B, I.I Chundrigar Road, Karachi": Sindh sales tax, 15 %
// since 1 July 2024.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/optimus/optimus_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/optimus/optimus_cost.mjs ATRL PSX PKR --shares=230 --price=1207
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];

const cost = makePsxCost({
  folder: "optimus",
  brand: "Optimus Capital Management",
  catalogueUrl: new URL("optimus-parsed.json", import.meta.url),
  url: "https://optimus.pk/commission-structure/",
  urls: ["https://optimus.pk/wp-content/uploads/Commission_structure_optimus.pdf"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Optimus : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur (PSX/N-1258), à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "rate as per PSX/N-1258 (3 paisa or 0.15%, whichever is higher); intra-day squared trade one side under that notice",
    "no sales-tax rate printed: Sindh SST 15% (Karachi office)",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
