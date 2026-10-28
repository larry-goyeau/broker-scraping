// What one round trip costs at Primo Securities (NEPSE broker no. 16,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// https://www.primosecurities.com.np/services/brokerage read on 2026-10-26
// (a React page; the words are in its script bundle /assets/index-*.js),
// "Brokerage Charges in Nepal", Equity (Amount / Fee):
//   Up to 50,000                 0.40%
//   50,001 to 5,00,000           0.37%
//   5,00,001 to 20,00,000        0.34%
//   20,00,001 to 1,00,00,000     0.30%
//   Above 1,00,00,000            0.27%
//   FAQ: "Apart from the standard brokerage commission, you only pay the
//   mandatory 0.010% SEBON fee and Rs. 25 DP charge per script."
// That table is the SEBON cap from before the 10 % cut of Jestha 1, 2081
// (14 May 2024; https://www.sharesansar.com/newsdetail/sebon-to-enact-revised-commission-rates-for-stockbrokers-implementation-begins-today-2024-05-14).
// Commission on NEPSE TMS is charged at the regulated rate ("the standard
// brokerage commission"), so the current cap (0.36 / 0.33 / 0.31 / 0.27 /
// 0.24 %, NEPSE_BANDS) is used, not the stale table. The SEBON fee is
// likewise the regulator's: 0.015 % on equity, as every other NEPSE page
// prints it (0.010 % is not the equity rate). No minimum is printed for
// shares. The SEBON fee and the Rs 25 DP charge are paid on each side.
// Online: the same bundle offers "fast TMS setup" and "Open TMS Account";
// orders are placed on NEPSE TMS (tms16.nepsetms.com.np).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/primo/primo_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Primo Securities",
  folder: "primo",
  catalogueUrl: new URL("primo-parsed.json", import.meta.url),
  url: "https://www.primosecurities.com.np/services/brokerage",
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
