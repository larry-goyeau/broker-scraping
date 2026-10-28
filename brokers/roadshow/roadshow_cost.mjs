// What one round trip costs at RoadShow Securities (NEPSE broker no. 92,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// https://roadshowsecurities.com.np/Services read on 2026-10-26 (the page
// prints the answer of /GetPublishedServices), "Stock Brokerage Charge"
// (Transaction Volume / Percent of Turnover):
//   Upto Rs. 2500                          Flat Rs.10
//   From Rs 2501 to Rs 50,000              0.36 Percent
//   From Rs 50,001 to Rs 500,000           0.33 Percent
//   From Rs 5,00,001 to Rs 2,00,000        0.31 Percent   (sic: 20,00,000)
//   From Rs 200,001 to Rs 10,000,000       0.27 Percent   (sic: 20,00,001)
//   From Rs 10,000,000 Onwards             0.24 Percent
//   "*An additional 0.015% regulatory fee and Rs 25 DP charge are
//   included in the above brokerage charges."
// The two typos are the SEBON bands every NEPSE member charges (same as
// Kumari's), with a flat Rs 10 for an order of Rs 2,500 or less and the
// band rate alone above it. The footnote calls the 0.015 % fee and the
// Rs 25 DP charge "additional": they are the SEBON transaction fee and the
// CDSC transfer charge every member adds on top of the bands, so they are
// added here, on each side. Orders go online through TMS (home page "TMS
// Login", https://tms.roadshowsecurities.com.np/atsweb/login).
//
// In the total: the NEPSE book, brokerage on both sides (flat Rs 10 up to
// Rs 2,500), the SEBON fee on both sides, the DP charge on both sides. No
// remark. Capital gains tax is on the gain, not the trade, and is not
// counted. The sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/roadshow/roadshow_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "RoadShow Securities",
  folder: "roadshow",
  catalogueUrl: new URL("roadshow-parsed.json", import.meta.url),
  url: "https://roadshowsecurities.com.np/Services",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  flat: { upTo: 2_500, fee: 10 },
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
