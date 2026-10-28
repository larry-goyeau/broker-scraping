// What one round trip costs at N.I.M.B. Stock Markets (NEPSE broker no.
// 75, a subsidiary of Nepal Investment Mega Bank): buy n shares on the
// Nepal Stock Exchange through NEPSE's Trade Management System (TMS) and
// sell them straight back, in dollars. Every NEPSE line is quoted in
// rupees and the account settles in rupees, so nothing is converted.
//
// https://nimbstock.com.np/knowledge/fees-commission-and-cgt/ read on
// 2026-10-26, "Equity Shares" (Transaction Amount / Commission):
//   Rs. 50,000 or less                     0.36%
//   Rs. 50,001 to Rs. 500,000              0.33%
//   Rs. 500,001 to Rs. 2,000,000           0.31%
//   Rs. 2,000,001 to Rs. 10,000,000        0.27%
//   Above Rs. 10,000,000                   0.24%
//   "An additional 0.015% SEBON transaction is applicable on the
//   transaction amount. Additional Rs. 25 per stock per transfer day is
//   applicable as DP transaction charge to be paid to DP."
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed for shares (the Rs 10 floors are on the bond and fund
// tables). The SEBON fee and the Rs 25 DP charge are paid on each side.
// https://nimbstock.com.np/our-services/brokerage/: "Equity Trading. Dive
// into the world of stocks with TMS platform" (TMS login
// https://tms.nimbstock.com.np/atsweb/login).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax
// (5 % / 3.75 % for individuals, same page) is on the gain, not the trade,
// and is not counted. The sums are in ../onlinesecurities/nepseCost.mjs
// over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/nimb/nimb_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "NIMB Stock Markets",
  folder: "nimb",
  catalogueUrl: new URL("nimb-parsed.json", import.meta.url),
  url: "https://nimbstock.com.np/knowledge/fees-commission-and-cgt/",
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
