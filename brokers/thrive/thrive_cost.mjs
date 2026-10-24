// What one round trip costs at Thrive Brokerage House (NEPSE broker no. 13):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://thrivebrokerage.com/pages/fee-comission read on 2026-10-23,
// "Fees/Commissions", table "Equity" (Commission in %):
//   Upto Rs.50,000 or Less     Flat Rs 10 or 0.36% (whichever is higher)
//   From Rs.50,001 To Rs.5,00,000          0.33%
//   From Rs.5,00,001 To Rs.20,00,000       0.31%
//   From Rs.20,00,001 To Rs.1,00,00,000    0.27%
//   Above Rs.1,00,00,001                   0.24%
//   "Commission is based on per transaction amount. Commission amount
//   includes NEPSE Commission 20% of only total Commission amount per
//   transaction & SEBON Regularity Fee 0.015% per transaction's whole
//   amount & and Rs 25 DP charges is applicable."
// The SEBON bands every NEPSE member charges (same as Kumari's). The NEPSE
// share is cut out of the commission; the SEBON fee (0.015 % of the whole
// amount) and the Rs 25 DP charge are counted on top of it on each side,
// as the other NEPSE brokers print them ("additional of 0.015% SEBON
// transaction fee and Rs 25 DP charges") and as TMS bills them. The Rs 10
// floor only bites under Rs 2,778 an order.
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../kumari/nepseDelivery.mjs; the Rs 10 floor and a DP charge
// taken on the sell only (Sagarmatha) are added by nepseRoundTripWith
// in that same module.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/thrive/thrive_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTripWith, printCli } from "../kumari/nepseDelivery.mjs";

const SEBON_BANDS = [
  { upTo: 50_000, rate: 0.0036 },
  { upTo: 500_000, rate: 0.0033 },
  { upTo: 2_000_000, rate: 0.0031 },
  { upTo: 10_000_000, rate: 0.0027 },
  { upTo: Infinity, rate: 0.0024 },
];

const SCHEDULE = {
  broker: "Thrive Brokerage House",
  folder: "thrive",
  catalogueUrl: new URL("thrive-parsed.json", import.meta.url),
  url: "https://thrivebrokerage.com/pages/fee-comission",
  readOn: "2026-10-23",
  // Upper bound of the band in rupees (inclusive) and its rate.
  bands: SEBON_BANDS,
  minimum: 10,
  sebon: 0.00015,
  dp: 25,
  remark: "",
};

export function roundTrip(query) {
  return nepseRoundTripWith(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
