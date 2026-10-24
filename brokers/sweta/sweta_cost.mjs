// What one round trip costs at Sweta Securities (NEPSE broker, Kathmandu):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://swetasecurities.com/services read on 2026-10-23, tab "Equity"
// (Brokerage fee):
//   Up To Rs. 2500                 Flat Rs 10
//   Rs 50,000 or Less              0.36%
//   50,001 to 5,00,000             0.33%
//   5,00,001 to 20,00,000          0.31%
//   20,00,001 to 1,00,00,000       0.27%
//   Above 1,00,00,000              0.24%
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order (0.36 % of Rs 2,500 is Rs 9). The page prints no
// SEBON fee or DP charge; both are market-wide and are taken as the other
// NEPSE brokers print them ("additional of 0.015% SEBON transaction fee
// and Rs 25 DP charges"), on each side.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sweta/sweta_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { printCli } from "../kumari/nepseDelivery.mjs";
import { nepseRoundTripWith } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Sweta Securities",
  folder: "sweta",
  catalogueUrl: new URL("sweta-parsed.json", import.meta.url),
  url: "https://swetasecurities.com/services",
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
