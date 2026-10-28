// What one round trip costs at Darson Securities (Vtrade): buy n shares at
// price p, sell them back at once, in dollars. Online, PSX ready market.
// Custody stays out.
//
// The online-trading commission sheet, read on 2026-10-26:
//
//   https://www.darson.com.pk/DownloadableData/Commissionstructureonlinetrading.pdf
//
//   "Commission 3 paisa per share or 0.15% of value, whichever is higher"
//   "Sindh Sales Tax (SST): 13% on commission amount"
//   "CDC Charges shall be applicable on transactions as per CDC
//   Regulations." "NCCPL Charges shall be applicable as per NCCPL
//   Schedule" "All other regularity levies shall be applicable."
//   "One sided commission will be charged on all intraday trades." This
//   trip is not squared the same day, so the commission is each way; the
//   remark gives the same-day saving.
//   Daily roll-over commission (leverage products), weekly rollover
//   (futures), CGT computation charges (NCCPL, annual by traded value) and
//   the "Rs.5000/- minimum account balance": not a cash trade, out.
//
// The sheet's SST 13 % predates 1 July 2024, when the Sindh rate on
// brokerage became 15 % (Sindh Finance Act 2024; Darson's corporate office
// is on I. I. Chundrigar Road, Karachi): 15 % is used.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/darson/darson_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/darson/darson_cost.mjs KEL PSX PKR --shares=45000 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];

const cost = makePsxCost({
  folder: "darson",
  brand: "Darson Securities",
  catalogueUrl: new URL("darson-parsed.json", import.meta.url),
  url: "https://www.darson.com.pk/DownloadableData/Commissionstructureonlinetrading.pdf",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  plans: {
    online: {
      label: "Online",
      basis:
        "Darson, commission en ligne : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur, à chaque sens, plus SST 15 % (la fiche imprime encore 13 %, taux d'avant le 1er juillet 2024)",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "sheet prints SST 13%, the Sindh rate before 1 July 2024: 15% used",
    "one-sided commission on intraday trades (Darson sheet): the trip pays it each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
