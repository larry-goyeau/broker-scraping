// What one round trip costs at SharePro Securities (NEPSE broker, Dhalko,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees (deposits.mjs), so nothing is converted.
//
// https://shareprosecurities.com/services/brokerage-services read on
// 2026-10-23, "STOCK BROKERAGE SERVICE CHARGES" ("all our service charges
// are fixed by regulatory aurthorities"):
//   From Rs. 1 to Rs. 50,000               0.36 Percent
//   From Rs. 50,001 to Rs. 5,00,000        0.33 Percent
//   From Rs. 5,00,001 to Rs. 20,00,000     0.31 Percent
//   From Rs. 20,00,001 to Rs. 1,00,00,000  0.27 Percent
//   From Rs. 1,00,00,000 Onwards           0.24 Percent
//   "*All transactions attract 0.015% regulatory fee in addtion to above
//   brokerage charges"
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The page prints no DP charge; the market-wide Rs 25
// is taken as the other NEPSE brokers print it, on each side.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sharepro/sharepro_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "SharePro Securities",
  folder: "sharepro",
  catalogueUrl: new URL("sharepro-parsed.json", import.meta.url),
  url: "https://shareprosecurities.com/services/brokerage-services",
  readOn: "2026-10-23",
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
