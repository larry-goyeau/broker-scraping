// What one round trip costs at Trishul Securities and Investment (NEPSE
// broker no. 29): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, tms29.nepsetms.com.np) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees, so nothing is converted.
//
// https://trishulsecurities.com.np/our-services/ read on 2026-10-26 (behind
// a Cloudflare challenge; read through a fetch that renders it), "Stock
// Brokerage Services": "The Broker commission rate is fixed by the
// regulatory authorities." (Transaction volume / Percent of turnover):
//   Up to Rs. 50,000                       0.36%
//   Rs. 50,001 to Rs. 5,00,000             0.33%
//   Rs. 5,00,001 to Rs. 20,00,000          0.31%
//   Rs. 20,00,001 to Rs. 1,00,00,000       0.27%
//   Rs. 1,00,00,000 onwards                0.24%
//   Depository Services: "On Market Transactions at DP" Rs. 25 Per Transfer.
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The page prints no SEBON fee; it is market-wide and
// is taken as the other NEPSE brokers print it (0.015 % of the amount). The
// SEBON fee and the Rs 25 DP charge are paid on each side. Online: the
// page's "Online Trading" link goes to the TMS login.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides (market-wide figure), the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/trishul/trishul_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Trishul Securities and Investment",
  folder: "trishul",
  catalogueUrl: new URL("trishul-parsed.json", import.meta.url),
  url: "https://trishulsecurities.com.np/our-services/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  marketWide: ["sebon"],
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
