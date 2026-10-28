// What one round trip costs at Stoxkarts Securities (NEPSE broker no. 86,
// Dillibazar, Kathmandu): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees, so nothing is converted.
//
// https://stoxkarts.com.np/pricing/ read on 2026-10-26, "Stock Brokerage
// Service Charges" (Percent of Turnover):
//   From Rs. 1 to Rs. 50,000               0.36 Percent
//   From Rs. 50,001 to Rs. 500,000         0.33 Percent
//   From Rs. 5,00,001 to Rs. 20,00,000     0.31 Percent
//   From Rs. 20,00,001 to Rs. 1,00,00,000  0.27 Percent
//   From Rs. 1,00,00,000 Onwards           0.24 Percent
//   "All transactions attract 0.015% regulatory fee in addition to above
//   brokerage charges." (the SEBON transaction fee)
//   DP charges, same page: securities transfer fee "रु. २५ (प्रति कम्पनी,
//   प्रति दिन)" = Rs 25 per company per day.
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The SEBON fee and the Rs 25 DP charge are paid on
// each side. https://stoxkarts.com.np/services/: "Log in and place buy and
// sell orders securely anytime, anywhere using your computer or
// smartphone" (online TMS account).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/stoxkarts/stoxkarts_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Stoxkarts Securities",
  folder: "stoxkarts",
  catalogueUrl: new URL("stoxkarts-parsed.json", import.meta.url),
  url: "https://stoxkarts.com.np/pricing/",
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
