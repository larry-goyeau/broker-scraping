// What one round trip costs at Crystal Kanchanjungha Securities (NEPSE
// broker no. 50, Kathmandu): buy n shares on the Nepal Stock Exchange
// through NEPSE's Trade Management System (TMS) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://crystalsecurities.com/trading-commission-and-fees/ read on
// 2026-10-26, "Equity Shares Commission Structure" (Transaction Amount /
// Commission Rate):
//   Rs. 2500 or less                       10
//   Rs. 2501 to 50,000                     0.36%
//   Rs. 50,001 to Rs. 500,000              0.33%
//   Rs. 500,001 to Rs. 2,000,000           0.31%
//   Rs. 2,000,001 to Rs. 10,000,000        0.27%
//   Above Rs. 10,000,000                   0.24%
//   "SEBON Transaction Fee : 0.015% of the transaction amount"
//   "DP Transaction Charge : Rs. 25 per stock per day"
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// flat Rs 10 for an order of Rs 2,500 or less and the band rate alone
// above it. The SEBON fee and the Rs 25 DP charge are paid on each side.
// https://crystalsecurities.com/services/: clients place buy and sell
// orders for NEPSE-listed securities through their TMS account ("TMS
// खातामार्फत ... खरिद तथा बिक्री आदेश पेश गर्न सक्नुहुन्छ"); TMS 50 is
// https://tms50.nepsetms.com.np/.
//
// In the total: the NEPSE book, brokerage on both sides (flat Rs 10 up to
// Rs 2,500), the SEBON fee on both sides, the DP charge on both sides. No
// remark. Capital gains tax is on the gain, not the trade, and is not
// counted. The sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/crystalkanchanju/crystalkanchanju_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Crystal Kanchanjungha Securities",
  folder: "crystalkanchanju",
  catalogueUrl: new URL("crystalkanchanju-parsed.json", import.meta.url),
  url: "https://crystalsecurities.com/trading-commission-and-fees/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  flat: { upTo: 2_500, fee: 10 },
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
