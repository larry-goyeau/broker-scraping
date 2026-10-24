// What one round trip costs at Dakshinkali Investment & Securities (NEPSE
// broker no. 33): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS 33, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees (deposits.mjs), so nothing is converted.
//
// https://displtd33.com/broker-services/ read on 2026-10-24, tab "Equity"
// (Brokerages Fee*):
//   Rs 50,000 or Less                      0.36
//   50,001 to 5,00,000                     0.33%
//   500,001 to 20,00,000                   0.31%
//   20,00,001 to 1,00,00,000               0.27%
//   Above 1,00,00,000                      0.24%
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed for equity (the Rs 10 floor on the page is for bonds
// and funds only). The asterisk has no footnote and the page prints no
// SEBON fee or DP charge. https://displtd33.com/faqs/, same day: a
// secondary-market trade "attracts addition fees and charges like: broker
// commission, SEBON fees and DP Charge", without amounts. Both are
// market-wide: the 0.015 % SEBON transaction fee and the Rs 25 CDSC
// on-market transfer charge (as at Nabil Stock Dealer: "Rs. 25 per BO,
// per stock, per Settlement ID"), on each side.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/dakshinkali/dakshinkali_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Dakshinkali",
  folder: "dakshinkali",
  catalogueUrl: new URL("dakshinkali-parsed.json", import.meta.url),
  url: "https://displtd33.com/broker-services/",
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
