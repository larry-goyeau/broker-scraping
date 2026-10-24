// What one round trip costs at Sagarmatha Securities (NEPSE broker no. 18):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, tms18.nepsetms.com.np) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees (deposits.mjs), so nothing is converted.
//
// https://sagarmathasecurities.com/services read on 2026-10-23 (a React
// page; the words are in https://sagarmathasecurities.com/assets/index-*.js),
// "Brokerage Charges & Commission", equity tab:
//   0 to 50,000                    0.36% or Min Rs. 10
//   50,001 to 5,00,000             0.33%
//   5,00,001 to 20,00,000          0.31%
//   20,00,001 to 1,00,00,000       0.27%
//   1,00,00,001 to Above           0.24%
//   "SEBON Commission 0.015% Securities Board of Nepal regulatory fee"
//   "DP Charge (Sell only) रू 25 per company per day"
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order. Unlike the brokers that print the DP charge
// under every transaction, Sagarmatha takes it on the sell only, and its
// share calculator on the same page does the same (DP 25 on a sell, 0 on
// a buy). The calculator also caps brokerage at Rs 10,000 an order; the
// table prints no cap, so none is applied (it would only bite above about
// Rs 32 lakh an order).
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on the sell. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs (nepseRoundTripWith for the floor).
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sagarmatha/sagarmatha_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { printCli } from "../kumari/nepseDelivery.mjs";
import { nepseRoundTripWith } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Sagarmatha Securities",
  folder: "sagarmatha",
  catalogueUrl: new URL("sagarmatha-parsed.json", import.meta.url),
  url: "https://sagarmathasecurities.com/services",
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
  dpSellOnly: true,
  remark: "",
};

export function roundTrip(query) {
  return nepseRoundTripWith(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
