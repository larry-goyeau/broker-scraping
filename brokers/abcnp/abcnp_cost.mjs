// What one round trip costs at ABC Securities (NEPSE broker no. 17,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, tms17.nepsetms.com.np) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees, so nothing is converted.
//
// https://abc.com.np/ read on 2026-10-26, "Fees And Commission", Equity:
//   0.36% minimum Rs. 10 for Up to Rs. 50,000
//   0.33% for Rs. 50,000 - Rs. 500,000
//   0.31% for Rs. 500,001 - Rs. 2,000,000
//   0.27% for Rs. 2,000,001 - Rs. 10,000,000
//   0.24% for Above Rs. 10,000,001
//   "SEBON Commission for all: 0.015%"
//   DP Charges: "Share Transfer Cost (DP Amount) Rs. 25 per company per day"
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order (0.36 % of Rs 2,778 is Rs 10). The SEBON fee and
// the Rs 25 DP charge are paid on each side. Online: the same page links
// the client's TMS ("Portals TMS") and the account opening is digital
// ("Digital Thumb Print", "Digitally Scan Cheque").
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/abcnp/abcnp_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "ABC Securities",
  folder: "abcnp",
  catalogueUrl: new URL("abcnp-parsed.json", import.meta.url),
  url: "https://abc.com.np/",
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
