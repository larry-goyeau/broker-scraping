// What one round trip costs at Sumeru Securities (NEPSE broker no. 39):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, tms39.nepsetms.com.np) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees (deposits.mjs), so nothing is converted.
//
// https://www.sumerusecurities.com/ read on 2026-10-24, section "Our
// Services", tab "Equity" (the site is a React page; the table is filled
// from https://www.sumerusecurities.com/api/settings/calculator-rates,
// which also drives https://www.sumerusecurities.com/calculator):
//   Up to Rs 50,000                0.36% or Min Rs. 10
//   Rs 50,001 to 5,00,000          0.33%
//   Rs 5,00,001 to 20,00,000       0.31%
//   Rs 20,00,001 to 1,00,00,000    0.27%
//   Above 1,00,00,000              0.24%
//   SEBON Commission               0.015%
//   DP Charge (per order)          Rs. 25 per company per day
//   "Brokerage rates as per SEBON slab rate structure."
// The calculator takes the Rs 10 floor, the SEBON fee and the Rs 25 DP
// charge on the buy and on the sell.
// https://www.sumerusecurities.com/faqs, same day, "What are the brokerage
// charges?": "0.36% for amounts up to NPR 50,000, 0.33% for NPR 50,001 to
// 5,00,000, and 0.24% for above NPR 5,00,000. SEBON fee and DP charges are
// additional." That short answer does not merely leave bands out: it puts
// Rs 5 lakh to Rs 1 crore at 0.24 %, against the 0.31 % and 0.27 % of the
// SEBON schedule. The commission is fixed by SEBON for every member and
// billed by TMS, and Sumeru's own full table and calculator print the
// SEBON schedule, so that schedule is used (same as Kumari's).
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sumeru/sumeru_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTripWith, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Sumeru Securities",
  folder: "sumeru",
  catalogueUrl: new URL("sumeru-parsed.json", import.meta.url),
  url: "https://www.sumerusecurities.com/",
  readOn: "2026-10-24",
  // Upper bound of the band in rupees (inclusive) and its rate.
  bands: [
    { upTo: 50_000, rate: 0.0036 },
    { upTo: 500_000, rate: 0.0033 },
    { upTo: 2_000_000, rate: 0.0031 },
    { upTo: 10_000_000, rate: 0.0027 },
    { upTo: Infinity, rate: 0.0024 },
  ],
  minimum: 10,
  sebon: 0.00015,
  dp: 25,
  remark: "",
};

export function roundTrip(query) {
  return nepseRoundTripWith(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
