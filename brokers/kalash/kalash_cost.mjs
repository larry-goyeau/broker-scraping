// What one round trip costs at Kalash Stock Market (NEPSE broker,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees (deposits.mjs), so nothing is converted.
//
// https://kalashstock.com.np/services/stock-brokerage-services read on
// 2026-10-23 ("all our service charges are fixed by regulatory
// authorities"):
//   Up to Rs.2500                          Flat Rs 10
//   From Rs.2501 to Rs.50,000              0.36 percent
//   From Rs 50,001 to Rs.5,00,000          0.33 percent
//   From Rs 5,00,001 to Rs.20,00,000       0.31 percent
//   From Rs 20,00,001 to Rs 1,00,00,000    0.27 percent
//   From 1,00,00,000 onwards               0.24 percent
//   "20% of the commission to NEPSE and 0.6% of the commission to SEBON as
//   regularity fee is also included in the above brokerage charges."
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order (0.36 % of Rs 2,500 is Rs 9). The note on what the
// commission includes is the old wording from before the SEBON fee was
// set at 0.015 % of the whole amount; TMS bills that fee on top of the
// commission at every member, so it is counted, as are the market-wide
// Rs 25 DP charge on each side the other NEPSE brokers print.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/kalash/kalash_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { printCli } from "../kumari/nepseDelivery.mjs";
import { nepseRoundTripWith } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Kalash Stock Market",
  folder: "kalash",
  catalogueUrl: new URL("kalash-parsed.json", import.meta.url),
  url: "https://kalashstock.com.np/services/stock-brokerage-services",
  readOn: "2026-10-23",
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
