// What one round trip costs at Pahi Investment (NEPSE broker no. 79,
// Putalisadak, Kathmandu): buy n shares on the Nepal Stock Exchange
// through NEPSE's Trade Management System (TMS) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://pahiinvestment.com/fees-commissions/ read on 2026-10-26,
// "Commission Details":
//   Up to Rs. 50000                        0.36%
//   From Rs. 50001 to Rs. 500000           0.33%
//   From Rs. 500001 to Rs. 2000000         0.31%
//   From Rs. 2000001 to Rs. 10000000       0.27%
//   From Rs. 10000000 and above            0.24%
//   "*additional of 0.015% SEBON transaction fee and Rs.25 DP charges is
//   applicable."
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The SEBON fee and the Rs 25 DP charge are paid on
// each side. https://pahiinvestment.com/services/: "Pahi Investment Pvt.
// Ltd. offers Online Trading through Trade Management System (TMS)",
// orders placed "from computer, smartphone and tablet".
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/pahi/pahi_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Pahi Investment",
  folder: "pahi",
  catalogueUrl: new URL("pahi-parsed.json", import.meta.url),
  url: "https://pahiinvestment.com/fees-commissions/",
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
