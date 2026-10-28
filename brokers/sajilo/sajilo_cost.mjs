// What one round trip costs at Sajilo Broker (NEPSE broker no. 90,
// Babarmahal, Kathmandu): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS 90) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees, so nothing is converted.
//
// https://sajilobroker.com.np/brokerage-services/ read on 2026-10-26,
// "Equity Trading" (Commission(In %)):
//   Up to Rs. 50,000 or Less       0.40% or Rs. 10(whichever is higher)
//   From Rs. 50,001 To Rs. 500,000         0.37%
//   From Rs. 500,001 To Rs. 2,000,000      0.34%
//   From Rs. 2,000,001 To Rs. 10,000,000   0.30%
//   Above Rs. 10,000,000                   0.27%
//   "Note: Commission Amount includes NEPSE Commission 20% of total
//   Commission Amount SEBON Regularity fee 0.6%"
// The table is the SEBON schedule before the 10 % cut of 14 May 2024
// (Jestha 1, 2081). The commission is fixed by SEBON for every member and
// computed by TMS, so the current bands are used (0.36 / 0.33 / 0.31 /
// 0.27 / 0.24 %, as at Kumari and Neev); the Rs 10 floor per order is
// taken from the page. The note on what the commission includes is the old
// wording from before the SEBON fee was set at 0.015 % of the amount; TMS
// bills that fee on top at every member, so it is counted at the
// market-wide rate (the page prints it only for funds and bonds, 0.010 % /
// 0.005 %). The DP charge is the page's own "Rs. 25 DP charge", printed
// under the fund and bond tables; it is the CDSC transfer fee for any
// security. Both are paid on each side. Same page: "Provide online trading
// facilities" (TMS 90 login).
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sajilo/sajilo_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Sajilo Broker",
  folder: "sajilo",
  catalogueUrl: new URL("sajilo-parsed.json", import.meta.url),
  url: "https://sajilobroker.com.np/brokerage-services/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  minimum: 10,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  marketWide: ["sebon"],
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
