// What one round trip costs at Sewa Securities (NEPSE broker no. 54,
// Kathmandu and Hetauda): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees, so nothing is converted.
//
// https://sewasecurities.com.np/ read on 2026-10-26, "Fees & Commision",
// "Ordinary share" (Range of Transaction Amount / Rate of Commision):
//   Upto NRs. 50,000                       0.36%
//   From NRs. 50,001 to NRs. 5,00,000      0.33%
//   NRs. 5,00,001 to NRs. 20,00,000        0.31%
//   NRs. 20,00,001 to NRs. 1,00,00,000     0.27%
//   Above NRs. 1,00,00,001                 0.24%
//   "SEBON Commision 0.015%"
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The SEBON fee is paid on each side. The page's "DP
// Charges" tab lists account, Mero Share and pledge fees only; the
// per-transfer charge is in the broker's own calculator,
// https://sewasecurities.com.np/share-calculator/ (read the same day): its
// "Dp" field is 25 and is added to "Total Amount Payable" on the buy and
// taken off "Amount Total (Sell)" on the sell, so Rs 25 on each side. The
// same calculator charges the same bands (0.0036 up to 50000 ... 0.0024
// above 10000000) and "SEBON Commision" 0.00015 each side. Orders go online
// through TMS 54 (the home page's "TMS Login" / "TMS Registration";
// https://tms54.nepsetms.com.np/).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/sewa/sewa_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Sewa Securities",
  folder: "sewa",
  catalogueUrl: new URL("sewa-parsed.json", import.meta.url),
  url: "https://sewasecurities.com.np/",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
