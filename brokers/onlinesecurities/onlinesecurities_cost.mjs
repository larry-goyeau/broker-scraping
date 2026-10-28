// What one round trip costs at Online Securities (NEPSE broker no. 49,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://onlinesecurities.com.np/services/Brokerage read on 2026-10-26,
// "Charges", Equity tab (Transaction Amount / Brokerage fee):
//   Up To Rs. 2500                 Flat Rs 10
//   Rs 50,000 or Less              0.36%
//   50,001 to 5,00,000             0.33%
//   5,00,001 to 20,00,000          0.31%
//   20,00,001 to 1,00,00,000       0.27%
//   Above 1,00,00,000              0.24%
// The SEBON bands every NEPSE member charges (same as Kumari's). The
// tariff page prints no SEBON fee or DP charge; the broker's own share
// calculator (https://onlinesecurities.com.np/calculator, read the same
// day) adds "SEBON Fee" at 0.015 % of the amount and "DP Amount" Rs 25 on
// the buy and takes both off the sell, and floors the commission at Rs 10
// on any order ("l<10&&(l=10)"). The Rs 10 floor is taken as a minimum per
// order: it gives the page's flat Rs 10 up to Rs 2,500 and the
// calculator's figure just above it (the larger of the two readings). The
// calculator's top band (0.25 % above Rs 1 crore) differs from the page's
// 0.24 %; the page is used, it only matters above Rs 1 crore.
// https://onlinesecurities.com.np/services/OnlineTms: "Buy and sell shares
// quickly ... through our user-friendly interface", "Mobile & Web Access"
// (TMS 49, https://tms49.nepsetms.com.np/login).
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ./nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/onlinesecurities/onlinesecurities_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "./nepseCost.mjs";

const SCHEDULE = {
  broker: "Online Securities",
  folder: "onlinesecurities",
  catalogueUrl: new URL("onlinesecurities-parsed.json", import.meta.url),
  url: "https://onlinesecurities.com.np/services/Brokerage",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  minimum: 10,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
