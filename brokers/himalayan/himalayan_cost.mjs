// What one round trip costs at Himalayan Brokerage Company (NEPSE broker
// no. 63): buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://himalayanbroker.com/services/brokerage-service read on
// 2026-10-24, "STOCK BROKERAGE SERVICE CHARGE" (Brokerage Charge %):
//   Rs. 50,000 or less                     0.36 %
//   Rs. 50,001 to Rs. 500,000              0.33 %
//   Rs. 5,00,001 to Rs. 20,00,000          0.31 %
//   Rs. 20,00,001 to Rs. 1,00,00,000       0.27 %
//   Rs 1,00,00,000 Above                   0.24 %
//   "*In addition to above brokerage charges 0.015% SEBON transaction fee
//   and Rs 25 DP charges is applicable."
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The SEBON fee and the Rs 25 DP charge are paid on
// each side. Same page: orders are placed online through TMS "from a
// computer, smartphone, or tablet".
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/himalayan/himalayan_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Himalayan",
  folder: "himalayan",
  catalogueUrl: new URL("himalayan-parsed.json", import.meta.url),
  url: "https://himalayanbroker.com/services/brokerage-service",
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
