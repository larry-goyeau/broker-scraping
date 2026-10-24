// What one round trip costs at Nabil Stock Dealer (NEPSE broker no. 77):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://www.nabilstockdealer.com.np/commission-rate/ read on 2026-10-24,
// tab "Equity Shares" (Commission):
//   Rs. 50,000 or less                     0.36%
//   Rs. 50,001 to Rs. 500,000              0.33%
//   Rs. 500,001 to Rs. 2,000,000           0.31%
//   Rs. 2,000,001 to Rs. 10,000,000        0.27%
//   Above Rs. 10,000,000                   0.24%
//   "Total commission comprises of 79.4% broker commission, 20% exchange
//   commission (NEPSE) and 0.6% regulatory fee (SEBON) An additional
//   0.015% SEBON transaction is applicable on the transaction amount.
//   Additional Rs. 25 per stock per transfer day is applicable as DP
//   transaction charge to be paid to DP."
// Same page, tab "Depository Fees": "On-Market Transaction Rs. 25 per BO,
// per stock, per Settlement ID". The SEBON bands every NEPSE member
// charges (same as Kumari's). No minimum is printed for equity (the Rs 10
// floor on the page is for bonds and funds only). The SEBON fee and the
// DP charge are paid on each side.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/nabilsd/nabilsd_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Nabil",
  folder: "nabilsd",
  catalogueUrl: new URL("nabilsd-parsed.json", import.meta.url),
  url: "https://www.nabilstockdealer.com.np/commission-rate/",
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
