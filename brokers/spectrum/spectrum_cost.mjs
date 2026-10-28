// What one round trip costs at Spectrum Securities: buy n shares at price
// p, sell them back at once, in dollars. Online (Vtrade, desktop and
// phone), PSX ready market. Custody stays out.
//
// The "Commission Structure" page ("For Spectrum Securities Online Trading
// Only", page last updated 23 December 2025), read on 2026-10-26:
//
//   https://www.spectrumonline.com.pk/commstr.php
//
//   "Standardized Commission Slab Applied" (the only slab the page shows):
//     "From Rs .01 To Rs 20 The Commission Will Be Charge .03 Paisa"
//                                  (Rs 0.03 a share)
//     "From Rs 20.01 To Onward Commission Will Be Charge .15% of Rate"
//                                  (0.15 % of the value)
//   That is the PSX floor, max(3 paisa, 0.15 %), band by band.
//   The page source still carries, commented out and not shown, an older
//   "Basic packages (Non trader Model)" table at 0.05 % of the value and a
//   "Premium packages (Assisted By trader)" line (0.15 % or 7 paisa, via a
//   trader, not online); the brochure
//   (https://www.spectrumonline.com.pk/downloads/spectrum-brochure.pdf)
//   still says "Commission @ .05% Of Value Or 3 Paisa Per Share Whichever
//   Is Greater", below the PSX floor no broker may charge on a delivery
//   since 14 October 2019. The shown slab is used, and any side below the
//   floor would be raised to it (applyFloor, akd precedent).
//
// Spectrum prints no sales-tax rate. Head office "Room No. 526 5th Floor
// Pakistan Stock Exchange Building, I.I. Chundrigarh Road Karachi": Sindh
// sales tax, 15 % since 1 July 2024. The page says nothing about a
// same-day square, so the trip charges the commission each way and adds no
// same-day remark.
//
// Levies (PSX trading fee plus SST, SECP levy, CDC 0.0036 %, NCCPL), the
// floor and their sources: ../nextcapital/psxCost.mjs.
//
// CGT is a tax on the gain: out.
//
//   node brokers/spectrum/spectrum_cost.mjs ATRL PSX PKR --shares=230 --price=1206
//   node brokers/spectrum/spectrum_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [
  { upTo: 20, perShare: 0.03 },
  { upTo: Infinity, rate: 0.0015 },
];

const cost = makePsxCost({
  folder: "spectrum",
  brand: "Spectrum Securities",
  catalogueUrl: new URL("spectrum-parsed.json", import.meta.url),
  url: "https://www.spectrumonline.com.pk/commstr.php",
  urls: ["https://www.spectrumonline.com.pk/downloads/spectrum-brochure.pdf"],
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  applyFloor: true,
  plans: {
    online: {
      label: "Online",
      basis:
        "Spectrum Securities, barème en ligne : 0,03 PKR par action jusqu'à 20 PKR, 0,15 % de la valeur à partir de 20,01 PKR, à chaque sens, plus SST 15 %",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  notes: [
    "Spectrum's brochure and a hidden old table still show 0.05% of the value, below the PSX floor: the slab the page shows (3 paisa to Rs 20, 0.15% above) is used",
    "no sales-tax rate printed: Sindh SST 15% (Karachi head office)",
    "same-day square not described by Spectrum: commission each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
