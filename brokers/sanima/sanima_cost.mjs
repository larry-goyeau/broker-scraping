// What one round trip costs at Sanima Securities (NEPSE broker no. 83, a
// subsidiary of Sanima Bank, Kathmandu): buy n shares on the Nepal Stock
// Exchange through NEPSE's Trade Management System (TMS, web and mobile)
// and sell them straight back, in dollars. Every NEPSE line is quoted in
// rupees and the account settles in rupees, so nothing is converted.
//
// https://www.sanimasecurities.com.np/our-services read on 2026-10-26,
// "Brokerage Fee Details" (Transaction Amount / Brokerage Fee*):
//   Rs 50,000 or Less              0.36%
//   50,001 to 5,00,000             0.33%
//   500,001 to 20,00,000           0.31%
//   20,00,001 to 1,00,00,000       0.27%
//   Above 1,00,00,000              0.24%
//   "*addition of 0.015% SEBON transaction fee and Rs 25 DP charges is
//   applicable"
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The SEBON fee and the Rs 25 DP charge are paid on
// each side. Same page: "Online Clients can place buy/sell orders through
// TMS electronically."
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sanima/sanima_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Sanima Securities",
  folder: "sanima",
  catalogueUrl: new URL("sanima-parsed.json", import.meta.url),
  url: "https://www.sanimasecurities.com.np/our-services",
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
