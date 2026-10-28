// What one round trip costs at Agrawal Securities (NEPSE broker no. 6,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://www.agrawalsecurities.com.np/trading-fee-structure/ read on
// 2026-10-26, "EQUITY TRADING", "Stock Broker Commission for Per
// Transaction":
//   0.36% or minimum Rs. 25 For below Rs. 50,000
//   0.33% for above RS. 50,000 upto RS. 500,000
//   0.31% for above RS. 500,000 upto RS. 2,000,000
//   0.27% for above RS. 2,000,000 upto RS. 10,000,000
//   0.24% for above RS. 10,000,000
//   "Sebon Commission 0.015% of Transaction Amount"
//   "Share Transfer Cost (DP Amount) Rs. 25 per Company per day"
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 25 floor per order (0.36 % reaches Rs 25 at about Rs 6,944). The
// SEBON fee and the Rs 25 DP charge are paid on each side. The mutual
// fund and bond tables on the same page do not apply: every catalogue
// line is a share.
// https://www.agrawalsecurities.com.np/trading-services/: "Using computer
// or smart phone with an internet connection one can directly enter into
// trading platform and trade securities through TMS system."
//
// In the total: the NEPSE book, brokerage on both sides (Rs 25 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/agrawal/agrawal_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Agrawal Securities",
  folder: "agrawal",
  catalogueUrl: new URL("agrawal-parsed.json", import.meta.url),
  url: "https://www.agrawalsecurities.com.np/trading-fee-structure/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  minimum: 25,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
