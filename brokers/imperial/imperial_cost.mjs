// What one round trip costs at Imperial Securities (NEPSE broker no. 45,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// https://imperialsecurities.com.np/quick-links/fees-and-commission read on
// 2026-10-26. The page is a Nuxt app; its words come from
// https://admin-dashboard.imperialsecurities.com.np/api/v1/fees-and-commissions
// (equity entry, updated 2024-05-14) (transaction amount / commission):
//   Rs. 50,000 or less                     0.36% or Rs. 10 whichever is higher
//   Rs. 50,001 to Rs. 500,000              0.33%
//   Rs. 500,001 to Rs. 2,000,000           0.31%
//   Rs. 2,000,001 to Rs. 10,000,000        0.27%
//   Above Rs. 10,000,000                   0.24%
//   "additional 0.015% SEBON transaction is applicable on the transaction
//   amount. Additional Rs. 25 per stock per transfer day is applicable as
//   DP transaction charge to be paid to DP."
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order. The SEBON fee and the Rs 25 DP charge are paid on
// each side. Orders go online through TMS 45
// (https://tms45.nepsetms.com.np/); the API's home entry: "We work with
// clients to place orders to buy or sell stocks".
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/imperial/imperial_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Imperial Securities",
  folder: "imperial",
  catalogueUrl: new URL("imperial-parsed.json", import.meta.url),
  url: "https://imperialsecurities.com.np/quick-links/fees-and-commission",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  minimum: 10,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
