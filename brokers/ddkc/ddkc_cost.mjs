// What one round trip costs at Dipshikha Dhitopatra Karobar Company (DDKC,
// NEPSE broker no. 38): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS38, web and mobile) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees (deposits.mjs), so nothing is converted.
//
// https://ddkc.com.np/share-calculator read on 2026-10-24. The page prints
// no rate table; the rates are in its calculator script
// (https://ddkc.com.np/new_site/js/custom.js, same day, get_broker_commision):
//   totalamount <= 50000                   0.36
//   > 50000 and <= 500000                  0.33
//   > 500000 and <= 2000000                0.31
//   > 2000000 and < 10000000               0.27
//   > 10000000                             0.24
//   SEBON fee 0.00015 * amount, "dp_charge = 25", on the buy and on the sell
// The SEBON bands every NEPSE member charges (same as Kumari's). The
// script has no minimum, and no rate for exactly Rs 1 crore (a slip); the
// SEBON band edge is used, Rs 1 crore paying 0.27 %. The SEBON fee and the
// Rs 25 DP charge are paid on each side.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/ddkc/ddkc_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Dipshikha Dhitopatra Karobar Company",
  folder: "ddkc",
  catalogueUrl: new URL("ddkc-parsed.json", import.meta.url),
  url: "https://ddkc.com.np/share-calculator",
  readOn: "2026-10-24",
  // Upper bound of the band in rupees (inclusive) and its rate.
  bands: [
    { upTo: 50_000, rate: 0.0036 },
    { upTo: 500_000, rate: 0.0033 },
    { upTo: 2_000_000, rate: 0.0031 },
    { upTo: 10_000_000, rate: 0.0027 },
    { upTo: Infinity, rate: 0.0024 },
  ],
  sebon: 0.00015,
  dp: 25,
  remark: "",
};

export function roundTrip(query) {
  return nepseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
