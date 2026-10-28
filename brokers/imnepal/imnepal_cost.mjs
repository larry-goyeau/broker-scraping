// What one round trip costs at Investment Management Nepal (NEPSE broker,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// online trading system (TMS/NOTS) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees, so nothing is converted.
//
// https://imnpltd.com.np/ read on 2026-10-26, "Commission rates for
// Brokerage and DP Charges" ("new rates effective form 1 Jestha 2081"),
// Ordinary Share (Range of Transaction Amount / Rate of Commision):
//   Up to Rs. 50,000                       0.360%
//   From Rs. 50,000 to Rs. 5,00,000        0.330%
//   From Rs. 5,00,001 to Rs. 20,00,000     0.310%
//   From Rs. 20,00,001 to Rs. 1,00,00,000  0.270%
//   Above Rs. 1,00,00,000                  0.240%
//   "SEBON Commision 0.015%"
// DP Charges, same page: "On market transaction Rs.25 per BO stock per
// settlement ID".
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed for shares (the Rs 10 floors are not on this page).
// The SEBON fee and the Rs 25 DP charge are paid on each side. Same page:
// "Real-time trade execution through NEPSE Online Trading System (NOTS)",
// "Both online and offline trading facilities" (TMS 53,
// https://tms53.nepsetms.com.np/login).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. Demat (Rs 100 a year)
// and Mero Share (Rs 50 a year) are holding costs and are left out. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/imnepal/imnepal_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Investment Management Nepal",
  folder: "imnepal",
  catalogueUrl: new URL("imnepal-parsed.json", import.meta.url),
  url: "https://imnpltd.com.np/",
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
