// What one round trip costs at BOP Capital Securities (formerly Punjab
// Capital Securities): buy n shares at price p, sell them back at once, in
// dollars. Online trading terminal, PSX ready market. Custody stays out.
//
// The commission slab ("PUNJAB CAPITAL RETAIL BROKERAGE SERVICES"), still
// the one the site links, read on 2026-10-26:
//
//   https://bopcapital.com.pk/wp-content/uploads/2022/11/Commission-Slab.pdf
//
//   "Commission Structure for Regular, Future", commission per share:
//     Rs 0.01 - 5.00      0.03
//     Rs 5.01 - 30.00     0.05
//     Rs 30.01 - Max      "0.15% of value"
//   "Note: Minimum Commission is 0.03 paisas or 0.15% whichever is higher"
//   (every band is at least max(Rs 0.03 a share, 0.15 %), the PSX floor).
//   "Online Trading Terminal Facility: Yes"; the same slab for every
//   channel.
//   "One side commission applied on Delivery & day trades": read as in
//   abbasi_cost.mjs, a commission on each side of a delivery (the PSX floor
//   applies to every buy and sell not squared the same day) and on one side
//   only of a day trade; the remark gives the same-day saving.
//   "UIN, CDC, CGT Calculation tariff, Biometric or OTP, NADRA verisys
//   charges etc; and all regulatory taxes will be levied on actual basis."
//
// Daily carry-over on futures, MFS and MTS (Rs 0.01 / 0.02 a share): other
// markets, out. UIN, CDC maintenance, NADRA and OTP charges: not per
// order, out.
//
// BOP prints no sales-tax rate. Office "North Tower, LSE Plaza,
// 19-Khayaban-e-Aiwan-e-Iqbal, Lahore" (https://bopcapital.com.pk/): Punjab
// sales tax on services, PST 16 %.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/bop/bop_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//   node brokers/bop/bop_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [
  { upTo: 5, perShare: 0.03, rate: 0.0015 },
  { upTo: 30, perShare: 0.05, rate: 0.0015 },
  { upTo: Infinity, perShare: 0.03, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "bop",
  brand: "BOP Capital Securities",
  catalogueUrl: new URL("bop-parsed.json", import.meta.url),
  url: "https://bopcapital.com.pk/wp-content/uploads/2022/11/Commission-Slab.pdf",
  urls: ["https://bopcapital.com.pk/", "https://bopcapital.com.pk/about-us/faqs/"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.punjab,
  plans: {
    online: {
      label: "Online",
      basis:
        "BOP Capital Securities : 0,03 PKR par action jusqu'à 5 PKR, 0,05 PKR par action de 5,01 à 30 PKR, 0,15 % de la valeur au-delà, au moins le plus élevé de 0,03 PKR par action et 0,15 %, à chaque sens, plus PST 16 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "no sales-tax rate printed: Punjab PST 16% (Lahore office)",
    "\"One side commission applied on Delivery & day trades\": commission on each side of a delivery, one side of a day trade",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
