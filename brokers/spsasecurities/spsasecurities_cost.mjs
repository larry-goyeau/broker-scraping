// What one round trip costs at S.P.S.A. Securities (NEPSE broker,
// Kathmandu): buy n shares on the Nepal Stock Exchange through NEPSE's
// Trade Management System (TMS) and sell them straight back, in dollars.
// Every NEPSE line is quoted in rupees and the account settles in rupees,
// so nothing is converted.
//
// https://spsasecurities.com.np/broker-charges read on 2026-10-26, in
// Nepali ("खरिद तथा विक्री कारोबारमा धितोपत्र दलाली बापत लिन पाउने सेवा
// शुल्क", the brokerage on buys and sells):
//   रु. ५०,००० सम्म (up to Rs 50,000)                    ०.३६ %
//   रु. ५०,००० माथि रु. ५,००,००० सम्म (to Rs 5 lakh)     ०.३३ %
//   रु. ५,००,००० माथि रु. २०,००,००० सम्म (to Rs 20 lakh) ०.३१ %
//   रु. २०,००,००० माथि रु. १,००,००,००० सम्म (to 1 crore) ०.२७ %
//   रु. १,००,००,००० माथि (above Rs 1 crore)              ०.२४ %
//   DP charges, same page: "धितोपत्र हस्तान्तरण शुल्क रु. २५ (प्रति कम्पनी,
//   प्रति दिन)" = transfer fee Rs 25 per company per day.
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The page prints no SEBON transaction fee; it is
// market-wide and is taken as the other NEPSE brokers print it ("0.015%
// SEBON transaction fee"), on each side, like the Rs 25 DP charge.
// https://spsasecurities.com.np/service/stock-brokerage-services: "SPSA
// Securities offers Online Trading through Trade Management System (TMS)."
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../onlinesecurities/nepseCost.mjs over ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/spsasecurities/spsasecurities_cost.mjs NABIL XNEP NPR --shares=280 --price=535
//
// `roundTrip(...)` reads files, not the network.

import { nepseCost, NEPSE_BANDS, SEBON_FEE, DP_CHARGE, printCli } from "../onlinesecurities/nepseCost.mjs";

const SCHEDULE = {
  broker: "S.P.S.A. Securities",
  folder: "spsasecurities",
  catalogueUrl: new URL("spsasecurities-parsed.json", import.meta.url),
  url: "https://spsasecurities.com.np/broker-charges",
  readOn: "2026-10-26",
  bands: NEPSE_BANDS,
  sebon: SEBON_FEE,
  dp: DP_CHARGE,
  marketWide: ["sebon"],
  remark: "",
};

export function roundTrip(query) {
  return nepseCost(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
