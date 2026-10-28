// What one round trip costs at Linch Stock Market (NEPSE broker no. 41,
// Kathmandu and Butwal): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees, so nothing is converted.
//
// https://linch.com.np/commission-and-fees/trading-and-commission-fees read
// on 2026-10-26, "Trading Commission & Fee (Effective From May 14 2024",
// "Equity Shares Commission" (Transaction Amount / Commission):
//   Rs. 50,000 or less                     0.36% or Rs. 10 whichever is higher
//   Rs. 50,001 to Rs. 500,000              0.33%
//   Rs. 500,001 to Rs. 2,000,000           0.31%
//   Rs. 2,000,001 to Rs. 10,000,000        0.27%
//   Above Rs. 10,000,000                   0.24%
//   "Additional Rs. 25 per stock per transfer day is applicable as DP
//   transaction charge to be paid to DP."
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order. The Rs 25 DP charge is paid on each side. The page
// prints the SEBON transaction fee for bonds only (0.010 % / 0.005 %), not
// for shares; the market-wide 0.015 % equity fee is used, on each side, as
// the other NEPSE brokers print it ("additional 0.015% SEBON transaction is
// applicable on the transaction amount", ssl.com.np). Orders go online
// through TMS 41 ("NEPSE Trade Manage System 41" in the page's links;
// https://tms41.nepsetms.com.np/).
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/linchmarket/linchmarket_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Linch Stock Market",
  folder: "linchmarket",
  catalogueUrl: new URL("linchmarket-parsed.json", import.meta.url),
  url: "https://linch.com.np/commission-and-fees/trading-and-commission-fees",
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
