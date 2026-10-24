// What one round trip costs at Neev Securities (NEPSE broker no. 47,
// Pulchowk, Lalitpur): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS, tms47.nepsetms.com.np) and sell
// them straight back, in dollars. Every NEPSE line is quoted in rupees and
// the account settles in rupees (deposits.mjs), so nothing is converted.
//
// https://neevsecurities.com/services read on 2026-10-23, "Stock Brokerage
// Services" (Brokerage Fee*):
//   1. Rs 50,000 or Less   Flat Rs 10 or 0.40% (whichever is higher)
//   2. 50,001 to 5,00,000  0.37%
//   3. 50,001 to 5,00,000  0.34%
//   4. 0.3% Flat Rs 10 or 0.40% (whichever is higher)
//   5. Above 1,00,00,000   0.27%
//   "Note: Additional of 0.015% SEBON transaction fee and Rs 25 DP charges
//   is applicable"
// The table is the SEBON schedule before the current cut, with its band
// labels garbled (two rows "50,001 to 5,00,000", a fourth row without a
// band). The commission is fixed by SEBON for every member and computed by
// TMS, so the current bands are used (0.36 / 0.33 / 0.31 / 0.27 / 0.24 %,
// as at Kumari); the Rs 10 floor per order, the 0.015 % SEBON fee and the
// Rs 25 DP charge are taken from Neev's note, on each side.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/neev/neev_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { printCli } from "../kumari/nepseDelivery.mjs";
import { nepseRoundTripWith } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Neev Securities",
  folder: "neev",
  catalogueUrl: new URL("neev-parsed.json", import.meta.url),
  url: "https://neevsecurities.com/services",
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
