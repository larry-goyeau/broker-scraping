// What one round trip costs at Magnet Securities and Investment Company
// (NEPSE broker no. 95): buy n shares on the Nepal Stock Exchange through
// NEPSE's Trade Management System (TMS, web and mobile) and sell them
// straight back, in dollars. Every NEPSE line is quoted in rupees and the
// account settles in rupees (deposits.mjs), so nothing is converted.
//
// https://magnetsecurities.com.np/pricing read on 2026-10-24, in Nepali,
// "खरिद तथा विक्री कारोबारमा धितोपत्र दलाली बापत लिन पाउने सेवा शुल्क"
// (service fee chargeable for brokerage on purchases and sales):
//   रु. ५०,०००।– सम्म                          ०.३६ %  (up to Rs 50,000: 0.36 %)
//   रु. ५०,०००।– माथि रु.५,००,०००।– सम्म           ०.३३ %  (above 50,000 to 5,00,000: 0.33 %)
//   रु. ५,००,०००।– माथि रु. २०,००,०००।–सम्म        ०.३१ %  (above 5,00,000 to 20,00,000: 0.31 %)
//   रु. २०,००,०००।– माथि रु. १,००,००,०००।– सम्म    ०.२७ %  (above 20,00,000 to 1,00,00,000: 0.27 %)
//   रु. १,००,००,०००।– माथि                     ०.२४ %  (above 1,00,00,000: 0.24 %)
// Same page, "निक्षेप सदस्यले लिने शुल्क" (depository member fees):
// "धितोपत्र हस्तान्तरण शुल्क रु. २५ (प्रति कम्पनी, प्रति दिन)" (securities
// transfer fee Rs 25, per company, per day); in English below: "On Market
// Transactions at DP *Payment Per Transfer Rs.25".
// The SEBON bands every NEPSE member charges (same as Kumari's); no
// minimum is printed. The page prints no SEBON fee; it is market-wide and
// taken as the other NEPSE brokers print it ("additional of 0.015% SEBON
// transaction fee"). The SEBON fee and the Rs 25 DP charge are paid on
// each side.
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored, so the total stays unknown until it exists.
//
//   node brokers/magnet/magnet_cost.mjs NABIL XNEP NPR --shares=250 --price=535.2
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Magnet",
  folder: "magnet",
  catalogueUrl: new URL("magnet-parsed.json", import.meta.url),
  url: "https://magnetsecurities.com.np/pricing",
  readOn: "2026-10-24",
  // Upper bound of the band in rupees (inclusive) and its rate.
  bands: [
    { upTo: 50_000, rate: 0.0036 },
    { upTo: 500_000, rate: 0.0033 },
    { upTo: 2_000_000, rate: 0.0031 },
    { upTo: 10_000_000, rate: 0.0027 },
    { upTo: Infinity, rate: 0.0024 },
  ],
  sebon: 0.00015,
  dp: 25,
  remark: "",
};

export function roundTrip(query) {
  return nepseRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
