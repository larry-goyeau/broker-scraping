// What one round trip costs at Opal Securities Investment (NEPSE broker
// no. 4, Lazimpat, Kathmandu): buy n shares on the Nepal Stock Exchange
// through its TMS (tms.opalsecurities.com.np, web and app) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees, so nothing is converted.
//
// https://opalsecurities.com.np/service/2/details read on 2026-10-26,
// "Online Trading", "For Equity Shares and Preference Shares" (From / To /
// Commission Rates):
//   1            50,000          0.40%
//   50,001       500,000         0.37%
//   5,00,001     20,00,000       0.34%
//   20,00,001    1,00,00,000     0.30%
//   1,00,00,001  Above           0.27%
//   "Our fee is regulated by SEBON and we charge the fees from our client as
//   prescribed by the regulatory." "In addition to this Rs 25 per script
//   will be charged as DP charge and 0.15% of total transaction as SEBON
//   commission."
// That table is the SEBON cap from before the 10 % cut of Jestha 1, 2081
// (14 May 2024; https://www.sharesansar.com/newsdetail/sebon-to-enact-revised-commission-rates-for-stockbrokers-implementation-begins-today-2024-05-14).
// Commission on NEPSE TMS is charged at the regulated rate, and the page
// itself says Opal charges "as prescribed by the regulatory", so the
// current cap (0.36 / 0.33 / 0.31 / 0.27 / 0.24 %, NEPSE_BANDS) is used, not
// the stale table. Its "0.15%" SEBON commission is the market-wide 0.015 %
// with a dropped zero (0.15 % would be ten times every other NEPSE page).
// No minimum is printed for shares. The SEBON fee and the Rs 25 DP charge
// are paid on each side. Online: "We offer our clients with a secure and
// efficient online trading platform where they can place their buy and
// sell orders by themselves" (same page); "Clients can trade online
// through TMS account" (https://opalsecurities.com.np/service/1/details).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/opal/opal_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Opal Securities Investment",
  folder: "opal",
  catalogueUrl: new URL("opal-parsed.json", import.meta.url),
  url: "https://opalsecurities.com.np/service/2/details",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
