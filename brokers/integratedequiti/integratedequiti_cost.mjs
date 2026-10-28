// What one round trip costs at Integrated Equities (IEL): buy n shares at
// price p, sell them back at once, in dollars. Online (trading platform and
// app), PSX ready market. Custody stays out.
//
// The "Open Account" page prints the commission table under each account
// (Sahulat, Individual, Corporate), the same table each time, read on
// 2026-10-26:
//
//   https://www.iel.net.pk/OpenAccount.html
//
//   Share price   "Delivery Both side (Buy & Sell)"
//   0.01-9.99     0.03                (Rs a share)
//   10-29.99      0.05                (Rs a share)
//   30-Maximum    "0.03 OR 0.15% Transaction Value (whichever is Higher)"
//   "Trading (Same Day Square up Trade) Single Side": the same figures,
//   one side only; the remark gives the same-day saving.
//   "The above Commission slab doesn't include the followings; Taxes:
//   Provincial Sales Taxes & Capital value Tax (CVT): as notified in the
//   official gazettes".
//
// The Sahulat account is "free" for the first 30 days ("only pay standard
// trading fees after your first 30 days"): a sign-up offer, out. The
// corporate FAQ line "0.03% or Rs 0.15 per trade" is a corporate account
// and contradicts the table printed for it: out. Daily roll-over on
// futures, MTS and MF: other markets, out. UIN, CDC and UKN maintenance
// "at actual", the NCCPL CGT fee: not per order, out.
//
// IEL prints no sales-tax rate. Head office "30 Cricketers Colony, 3rd
// floor, NETSOL Avenue, Ghazi Interchange, Ring Road, Lahore" (Lahore
// phone lines; the Karachi room is at the KSE building): Punjab sales tax
// on services, PST 16 %.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/integratedequiti/integratedequiti_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//   node brokers/integratedequiti/integratedequiti_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [
  { upTo: 9.99, perShare: 0.03 },
  { upTo: 29.99, perShare: 0.05 },
  { upTo: Infinity, perShare: 0.03, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "integratedequiti",
  brand: "Integrated Equities",
  catalogueUrl: new URL("integratedequiti-parsed.json", import.meta.url),
  url: "https://www.iel.net.pk/OpenAccount.html",
  urls: ["https://www.iel.net.pk/BrokerageService.html"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.punjab,
  plans: {
    online: {
      label: "Online",
      basis:
        "Integrated Equities : 0,03 PKR par action jusqu'à 9,99 PKR, 0,05 PKR par action de 10 à 29,99 PKR, à partir de 30 PKR le plus élevé de 0,03 PKR par action et 0,15 %, à chaque sens, plus PST 16 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "no sales-tax rate printed: Punjab PST 16% (Lahore head office)",
    "same-day square-up: commission on one side only (IEL table)",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
