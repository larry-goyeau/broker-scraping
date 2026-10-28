// What one round trip costs at Vision Securities (NEPSE broker no. 34,
// Kathmandu): buy n shares on the Nepal Stock Exchange through its online
// trading system (Atrad / TMS 34, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://www.visionsecurities.com.np/company-profile read on 2026-10-26,
// "Brokerage Commission" (Transaction commission / Commission (In %)):
//   Upto Rs.50000                       0.36
//   From Rs.50001 To Rs.500000          0.33
//   From Rs.500001 To Rs.2000000        0.31
//   From Rs.2000001 To Rs.10000000      0.27
//   Above Rs.10000001                   0.24
//   "Note: Commission Amount includes NEPSE Commission 20% of total
//   Commission Amount SEBON Regularity fee 0.6%"
//   "DP Fees ... DIS Charge Rs.25 per Company"
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The page prints no SEBON transaction fee; it is
// market-wide and taken as the other NEPSE brokers print it (0.015 % of
// the amount, each side). The Rs 25 DP charge is taken on each side, as
// every NEPSE broker's tariff and calculator takes it (the page's Rs 25
// DIS charge is the sell side of it). The account, DEMAT maintenance and
// Mero Share fees on the same page are yearly holding costs, left out.
// https://www.visionsecurities.com.np/service/stock-brokerage-services:
// "Online Trading Facilities: High-speed, secure digital platforms for
// trading from anywhere" (Atrad 34, https://tms34.visionsecurities.com.np).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/vision/vision_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Vision Securities",
  folder: "vision",
  catalogueUrl: new URL("vision-parsed.json", import.meta.url),
  url: "https://www.visionsecurities.com.np/company-profile",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  marketWide: ["sebon"],
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
