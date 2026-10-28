// What one round trip costs at R.B.B Securities (NEPSE broker owned by
// Rastriya Banijya Bank): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS, web and mobile) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees, so nothing is converted.
//
// https://www.rbbsecurities.com.np/services.html read on 2026-10-26,
// "Brokerage Commission For Equity and Preference Shares of Listed
// Entities" (Transaction volume / service charge):
//   Up to Rs.2500                          Flat Rs 10
//   From Rs.2501 to Rs.50,000              0.36 percent
//   From Rs 50,001 to Rs.5,00,000          0.33 percent
//   From Rs 5,00,001 to Rs.20,00,000       0.31 percent
//   From Rs 20,00,001 to Rs 1,00,00,000    0.27 percent
//   From 1,00,00,000 onwards               0.24 percent
// Depository Services, same page: "Share Transfer Charges Rs.25 per
// Script".
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// flat Rs 10 for an order of Rs 2,500 or less and the band rate alone
// above it. The page prints no SEBON transaction fee; it is market-wide
// and is taken as the other NEPSE brokers print it (0.015 % of the
// amount, each side). The Rs 25 transfer charge is taken on each side, as
// the NEPSE broker calculators do. Same page: "seamless Online Trading
// services through the Trade Management System (TMS) ... using their
// computer, smartphone, or tablet", collateral loaded "via NCHL platform".
//
// In the total: the NEPSE book, brokerage on both sides (flat Rs 10 up to
// Rs 2,500), the SEBON fee on both sides, the DP charge on both sides. No
// remark. Capital gains tax is on the gain, not the trade, and is not
// counted. Demat (Rs 100 a year) and Mero Share (Rs 50 a year) are holding
// costs and are left out. The sums are in ../onlinesecurities/nepseCost.mjs
// over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/rbb/rbb_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "RBB Securities",
  folder: "rbb",
  catalogueUrl: new URL("rbb-parsed.json", import.meta.url),
  url: "https://www.rbbsecurities.com.np/services.html",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  flat: { upTo: 2_500, fee: 10 },
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  marketWide: ["sebon"],
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
