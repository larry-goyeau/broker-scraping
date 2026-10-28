// What one round trip costs at Capital Hub (NEPSE broker no. 85,
// Anamnagar, Kathmandu): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS, tms85.nepsetms.com.np) and sell
// them straight back, in dollars. Every NEPSE line is quoted in rupees and
// the account settles in rupees, so nothing is converted.
//
// https://capitalhub.com.np/services/ read on 2026-10-26, "Brokerage
// Charges" (Transaction Amount / Brokerage Fee*):
//   Rs 50,000 or Less        Flat Rs 10 or 0.40% (whichever is higher)
//   50,001 to 5,00,000       0.37%
//   500,001 to 20,00,000     0.34%
//   20,00,001 to 1,00,00,000 0.3%
//   Above 1,00,00,000        0.27%
//   "*An addition of 0.015% SEBON transaction fee and Rs 25 DP charges are
//   applicable"
// The table is the SEBON schedule before the 10 % cut of 14 May 2024
// (Jestha 1, 2081). The commission is fixed by SEBON for every member and
// computed by TMS, so the current bands are used (0.36 / 0.33 / 0.31 /
// 0.27 / 0.24 %, as at Kumari and Neev, whose page prints the same old
// table); the Rs 10 floor per order, the 0.015 % SEBON fee and the Rs 25
// DP charge are taken from the page, on each side. Same page: "We trade
// marketable securities ... through online TMS and offline"; the home page
// says "we recommend engaging in online trading". Only the online price
// counts and it is the same.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/capitalhub/capitalhub_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Capital Hub",
  folder: "capitalhub",
  catalogueUrl: new URL("capitalhub-parsed.json", import.meta.url),
  url: "https://capitalhub.com.np/services/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  minimum: 10,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
