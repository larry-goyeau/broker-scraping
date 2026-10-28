// What one round trip costs at Kalika Securities (NEPSE broker no. 46,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// Two pages of the broker, both read on 2026-10-26:
// https://kalikasecurities.com/broker-commission/ (notice of July 26,
// 2024, an image in Nepali): the new rates in force from Jestha 1, 2081:
//   up to Rs 50 thousand                0.36%
//   Rs 50 thousand to Rs 5 lakh         0.33%
//   Rs 5 lakh to Rs 20 lakh             0.31%
//   Rs 20 lakh to Rs 1 crore            0.27%
//   above Rs 1 crore                    0.24%
// https://kalikasecurities.com/commission-and-fee/ (dated July 14, 2019,
// still on the site, still with the old rates "0.4% or Rs. 10 whichever
// is higher" down to 0.27 %): only what the 2024 notice does not replace
// is taken from it, the Rs 10 floor and the two fees:
//   "An additional 0.015% SEBON transaction is applicable on the
//   transaction amount."
//   "Additional Rs. 25 per stock per transfer day is applicable as DP
//   transaction charge to be paid to DP."
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order. The SEBON fee and the Rs 25 DP charge are paid on
// each side. Its site has a "TMS login" and an "Online Trading" page for
// online clients.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/kalika/kalika_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Kalika Securities",
  folder: "kalika",
  catalogueUrl: new URL("kalika-parsed.json", import.meta.url),
  url: "https://kalikasecurities.com/broker-commission/",
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
