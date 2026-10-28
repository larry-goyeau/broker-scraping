// What one round trip costs at Kohinoor Investment and Securities (NEPSE
// broker no. 35, Kathmandu): buy n shares on the Nepal Stock Exchange
// through NEPSE's Trade Management System (TMS) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://www.kohinoorinvestment.com/services/ read on 2026-10-26 (post of
// August 30, 2017, still on the site) prints the old SEBON schedule:
//   Upto Rs.50000                          0.40
//   From Rs.50001 To Rs.500000             0.37
//   From Rs.500001 To Rs.2000000           0.34
//   From Rs.2000001 To Rs.10000000         0.30
//   Above Rs.10000001                      0.27
// "The rate of commission is predefined by the SEBON." Those rates are
// above the SEBON cap in force since Jestha 1, 2081 (14 May 2024) and no
// NEPSE member may charge them. The broker posted a notice that very day,
// https://www.kohinoorinvestment.com/commission-change/ ("Commission
// Change", 2024-05-14), but its only content is an image
// (viber_image_2024-05-14_14-10-56-728.jpg) that now answers 404, so its
// figures cannot be read. The SEBON schedule the notice announces is used:
// 0.36 % up to Rs 50,000, 0.33 % to Rs 5 lakh, 0.31 % to Rs 20 lakh,
// 0.27 % to Rs 1 crore, 0.24 % above (the bands every NEPSE member
// charges, same as Kumari's; the cap is the most it may charge). No
// minimum is printed. The site prints no SEBON fee or DP charge; both are
// market-wide and are taken as the other NEPSE brokers print them
// ("additional 0.015% SEBON transaction is applicable on the transaction
// amount. Additional Rs. 25 per stock per transfer day is applicable as DP
// transaction charge", ssl.com.np), on each side. Orders go online through
// TMS 35 (https://www.kohinoorinvestment.com/online-and-offline-trading/:
// "We provide clients with a option of online and offline trading
// facilities"; the site's "Online Trading Login" is
// https://tms35.nepsetms.com.np/login).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/kohinoor/kohinoor_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Kohinoor Investment and Securities",
  folder: "kohinoor",
  catalogueUrl: new URL("kohinoor-parsed.json", import.meta.url),
  url: "https://www.kohinoorinvestment.com/commission-change/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  marketWide: ["sebon", "dp"],
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
