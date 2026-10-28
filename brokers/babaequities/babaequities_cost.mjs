// What one round trip costs at BABA Equities: buy n shares at price p, sell
// them back at once, in dollars. Online self trading, PSX ready market.
// Custody stays out.
//
// The PSX commission package ("Online Without Trader" in the site menu;
// "Online Self Trading – Commission Structure"), read on 2026-10-26. It is
// the only PSX package the site links:
//
//   https://bel.com.pk/wp-content/uploads/2025/03/BABA-Equities-Pvt.-Ltd-Commission-Slab-ST.pdf
//
//   Share price up to 20     "0.03 Pasia Per Share" (PKR 0.03 a share)
//   20.01 to above           "0.15% of the Transaction Value"
//   "The above rates are exclusive of Government Levies and Taxation."
//   "Regulatory charges (PSX, SECP, CDC and NCCPL) shall be billed to the
//   client as and when applicable."
//   "On Intraday trading, a single side commission shall be deducted."
//   Roll-over column: futures only, out.
//
// The intra-day line is one side: the remark says so. This trip is not
// squared the same day, so the commission is each way.
//
// BABA prints no sales-tax rate. Registered and head office "LSE Plaza,
// 19-Khayaban-e-Aiwan-e-Iqbal Road, Lahore" (https://bel.com.pk/contact-us/):
// Punjab sales tax on services, PST 16 %.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs. Both bands are the
// PSX floor.
//
// CGT is a tax on the gain: out.
//
//   node brokers/babaequities/babaequities_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/babaequities/babaequities_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const BANDS = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "babaequities",
  brand: "BABA Equities",
  catalogueUrl: new URL("babaequities-parsed.json", import.meta.url),
  url: "https://bel.com.pk/wp-content/uploads/2025/03/BABA-Equities-Pvt.-Ltd-Commission-Slab-ST.pdf",
  urls: ["https://bel.com.pk/contact-us/"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.punjab,
  plans: {
    online: {
      label: "Online Self Trading",
      basis:
        "BABA Equities « Online Self Trading » : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % à partir de 20,01 PKR, à chaque sens, plus PST 16 %",
      side: ({ notional, shares, price }) => bandSide(BANDS, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "no sales-tax rate printed: Punjab PST 16% (Lahore registered office)",
    "intraday trading: single side commission (BABA package note 3)",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
