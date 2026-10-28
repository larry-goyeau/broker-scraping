// What one round trip costs at Midas Stock Broking Company (NEPSE broker
// no. 21, Kathmandu and Butwal): buy n shares on the Nepal Stock Exchange
// through NEPSE's Trade Management System (TMS) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://midasstock.com.np/pricing read on 2026-10-26, "Brokerage
// Commission" (Transaction Volume / Percent of Turnover):
//   Upto Rs. 2,500                         Flat Rs. 10
//   From Rs. 2,501 to Rs. 50,000           0.36%
//   From Rs. 50,001 to Rs. 5,00,000        0.33%
//   From Rs. 5,00,001 to Rs. 20,00,000     0.31%
//   From Rs. 20,00,001 to Rs. 1,00,00,000  0.27%
//   From Rs. 1,00,00,000 Onwards           0.24%
//   "All transactions attract an additional 0.015% SEBON regulatory fee in
//   addition to above brokerage charges."
//   DEMAT & Depository Fees: "On Market Transactions Rs.25 per Scrip"
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// flat Rs 10 for an order of Rs 2,500 or less and the band rate alone
// above it. The SEBON fee and the Rs 25 DP charge are paid on each side.
// Online: "The NEPSE Online Account is used to place actual buy and sell
// orders in the market" (FAQ, https://midasstock.com.np/about).
//
// In the total: the NEPSE book, brokerage on both sides (flat Rs 10 up to
// Rs 2,500), the SEBON fee on both sides, the DP charge on both sides. No
// remark. Capital gains tax is on the gain, not the trade, and is not
// counted. Demat (Rs 100 a year) and Mero Share (Rs 50 a year) are holding
// costs and are left out. The sums are in ../onlinesecurities/nepseCost.mjs
// over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/midas/midas_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Midas Stock Broking Company",
  folder: "midas",
  catalogueUrl: new URL("midas-parsed.json", import.meta.url),
  url: "https://midasstock.com.np/pricing",
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
