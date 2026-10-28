// What one round trip costs at Ismail Iqbal Securities: buy n shares at
// price p, sell them back at once, in dollars. Online (trading software and
// smartphone app), PSX ready market. Custody stays out.
//
// The "Commission Structure & Charges" page, read on 2026-10-26:
//
//   https://ismailiqbal.com/Commission_Charges.php
//
//   "Commission Structure: Rs 0.03 per share or 0.15% of the transaction
//   value, whichever is higher (Minimum Commission by SECP)"
//   "Sindh Sales Tax (SST): 13% of Commission"
//   "CDC Handling: Rs 0.004 per share on delivery sale/purchase"
//   "The Day Trade Commission would be charged on ONE side ONLY." This
//   trip is not squared the same day, so the commission is each way; the
//   remark gives the same-day saving.
//
// The CDC handling charge is how Ismail Iqbal bills the depository on a
// delivery (as standardcapital's): it replaces the CDC 0.0036 % fee and is
// in the broker ticket, each way, without sales tax.
//
// The page's SST 13 % predates 1 July 2024, when the Sindh rate on
// brokerage became 15 % (Sindh Finance Act 2024; office "C-94 KDA Scheme 1,
// Main Karsaz Road, Karachi"): 15 % is used.
//
// Left out: transfer of physical shares to CDC (Rs 0.30 a share), CDC
// transfers in or out (Rs 0.004 a share), CDC investor account (Rs 1,000 a
// year), the NCCPL fixed annual CGT fee (by yearly traded value), NCCPL UIN
// (Rs 200 a year), trading account maintenance (Rs 1,000 a year), the
// NCCPL odd-lot charge (Rs 5 a trade, odd lots only), dividend tax and
// CGT: not part of a cash buy and sell of a market lot.
//
// Exchange, SECP and NCCPL levies and their sources:
// ../nextcapital/psxCost.mjs.
//
//   node brokers/ismailiqbal/ismailiqbal_cost.mjs OGDC PSX PKR --shares=930 --price=299.1 --bp=10
//   node brokers/ismailiqbal/ismailiqbal_cost.mjs KEL PSX PKR --shares=45000 --price=6.09 --bp=10
//
// `roundTrip(...)` reads files, not the network.

import { makePsxCost, bandSide, SALES_TAX } from "../nextcapital/psxCost.mjs";

const SLAB = [{ upTo: Infinity, perShare: 0.03, rate: 0.0015 }];
const CDC_HANDLING = 0.004;

const cost = makePsxCost({
  folder: "ismailiqbal",
  brand: "Ismail Iqbal Securities",
  catalogueUrl: new URL("ismailiqbal-parsed.json", import.meta.url),
  url: "https://ismailiqbal.com/Commission_Charges.php",
  readOn: "2026-10-26",
  salesTax: SALES_TAX.sindh,
  cdcHandlingPerShare: CDC_HANDLING,
  plans: {
    online: {
      label: "Online",
      basis:
        "Ismail Iqbal : le plus élevé de 0,03 PKR par action et 0,15 % de la valeur, à chaque sens, plus SST 15 % (la page imprime encore 13 %, taux d'avant le 1er juillet 2024) ; manutention CDC 0,004 PKR par action à chaque sens",
      side: ({ notional, shares, price }) => bandSide(SLAB, notional, shares, price),
    },
  },
  remark: "Selling the same day pays commission half less.",
  notes: [
    "page prints SST 13%, the Sindh rate before 1 July 2024: 15% used",
    "day-trade commission on one side only (Ismail Iqbal page): the trip pays it each way",
  ],
});

export const { roundTrip, PLANS, planOf } = cost;

if (import.meta.url === `file://${process.argv[1]}`) cost.printCli();
