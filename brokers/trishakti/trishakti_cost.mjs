// What one round trip costs at Trishakti Securities (NEPSE broker no. 48,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS, web and mobile) and sell them straight
// back, in dollars. Every NEPSE line is quoted in rupees and the account
// settles in rupees, so nothing is converted.
//
// https://trishakti.com.np/tools/share read on 2026-10-26 (the share
// calculator; the old /tools/share-calculator address is gone). Its
// settings are printed in the page (script "calc-config"):
//   "commission":{"tiers":[{"upTo":50000,"percent":0.36},
//   {"upTo":500000,"percent":0.33},{"upTo":2000000,"percent":0.31},
//   {"upTo":10000000,"percent":0.27},{"upTo":0,"percent":0.24}],
//   "minimum":10},"sebonFeePercent":0.015,"dpCharge":25
// The SEBON bands every NEPSE member charges (same as Kumari's), with a
// Rs 10 floor per order. The calculator shows "SEBON fee" and "DP charge"
// lines on both the Buy and the Sell tab, so both are paid on each side.
// It says "Estimates only, based on the fee and tax rates set by SEBON,
// NEPSE and the Government of Nepal"; no other tariff is published.
// https://trishakti.com.np/services/stock-trading: "trade NEPSE-listed
// securities through TMS from wherever you are".
//
// In the total: the NEPSE book, brokerage on both sides (Rs 10 minimum),
// the SEBON fee on both sides, the DP charge on both sides. No remark.
// Capital gains tax is on the gain, not the trade, and is not counted. The
// sums are in ../onlinesecurities/nepseCost.mjs over
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/trishakti/trishakti_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "Trishakti Securities",
  folder: "trishakti",
  catalogueUrl: new URL("trishakti-parsed.json", import.meta.url),
  url: "https://trishakti.com.np/tools/share",
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
