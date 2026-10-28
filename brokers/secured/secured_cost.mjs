// What one round trip costs at Secured Securities (NEPSE broker no. 36,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// https://ssl.com.np/trading-commission-and-fees read on 2026-10-26,
// "For Equity Shares" (Transaction Amount / Commission):
//   Up To Rs. 2500                         Flat Rs 10
//   Rs. 2501 to Rs. 50,000                 0.36%
//   Rs. 50,001 to Rs. 5,00,000             0.33%
//   Rs. 5,00,001 to Rs. 2,000,000          0.31%
//   Rs. 2,000,001 to Rs. 1,00,00,000       0.27%
//   Above Rs. 10,000,000                   0.24%
//   "An additional 0.015% SEBON transaction is applicable on the
//   transaction amount. Additional Rs. 25 per stock per transfer day is
//   applicable as DP transaction charge to be paid to DP."
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// flat Rs 10 for an order of Rs 2,500 or less and the band rate alone
// above it. The SEBON fee and the Rs 25 DP charge are paid on each side.
// https://ssl.com.np/service/trading: "We provide clients with a choice of
// both online as well as offline trading facilities" (TMS login
// https://tms.ssl.com.np); only the online price counts and it is the same.
//
// In the total: the NEPSE book, brokerage on both sides (flat Rs 10 up to
// Rs 2,500), the SEBON fee on both sides, the DP charge on both sides. No
// remark. Capital gains tax is on the gain, not the trade, and is not
// counted. The sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/secured/secured_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Secured Securities",
  folder: "secured",
  catalogueUrl: new URL("secured-parsed.json", import.meta.url),
  url: "https://ssl.com.np/trading-commission-and-fees",
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
