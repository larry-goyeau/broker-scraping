// What one round trip costs at NAASA Securities (NEPSE broker no. 58):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://naasasecurities.com.np/pricing/1 read on 2026-10-24, "Stock
// Brokerage Service Charges" ("all our service charges are fixed by
// regulatory authorities"), Percent of Turnover:
//   Upto Rs. 2,500                         Flat Rs. 10
//   From Rs. 2,501 to Rs. 50,000           0.36 Percent
//   From Rs. 50,001 to Rs. 500,000         0.33 Percent
//   From Rs. 5,00,001 to Rs. 20,00,000     0.31 Percent
//   From Rs. 20,00,001 to Rs. 1,00,00,000  0.27 Percent
//   From Rs. 1,00,00,000 Onwards           0.24 Percent
//   "*All transactions attract 0.015% regulatory fee in addtion to above
//   brokerage charges.*"
// https://naasasecurities.com.np/pricing/2, same day, "DEMAT Charges":
// "Rs. 25 Per Transfer" (the row label is missing on the page). The
// broker's calculator (https://naasasecurities.com.np/stock-calculation)
// adds a DP amount of 25 to the buy and to the sell.
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order (0.36 % of Rs 2,500 is Rs 9). The calculator
// swaps the two top rates (0.24 % up to Rs 1 crore, 0.27 % above); the
// printed table is followed.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/naasa/naasa_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTripWith, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "NAASA Securities",
  folder: "naasa",
  catalogueUrl: new URL("naasa-parsed.json", import.meta.url),
  url: "https://naasasecurities.com.np/pricing/1",
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
