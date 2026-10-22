// What one round trip costs at Malla & Malla Stock Broking (NEPSE broker no. 11):
// buy n shares on the Nepal Stock Exchange through NEPSE's Trade
// Management System (TMS, web and mobile) and sell them straight back, in
// dollars. Every NEPSE line is quoted in rupees and the account settles in
// rupees (deposits.mjs), so nothing is converted.
//
// https://mallastock.com/pages/brokers/services/trading read on 2026-10-21,
// "Charges", tab "Equity". Brokerage fee by transaction amount (NPR):
//   Rs 50,000 or less                   0.36 %
//   50,001 to 5,00,000                  0.33 %
//   5,00,001 to 20,00,000               0.31 %
//   20,00,001 to 1,00,00,000            0.27 %
//   Above 1,00,00,000                   0.24 %
//   "additional of 0.015% SEBON transaction fee and Rs 25 DP charges is
//   applicable"
// The same table as Siprabi's. Each buy and each sell is a transaction;
// the band is read on its whole value, which then pays that one rate. No
// minimum is printed for equity (the Rs 10 floor on the page is for bonds
// and funds only). The SEBON fee and the Rs 25 DP charge are paid on each
// side, as the table prints them under the brokerage
// fee of every transaction, and the broker's calculator
// (https://mallastock.com/pages/brokers/services/calculator) adds the Rs 25
// DP charge to both the buy and the sell. Ordinary, promoter and preference shares all take the
// equity tab.
// https://mallastock.com/pages/brokers/learn/faq, same day: no fee to open the
// broker account ("Not a single paisa to be paid"); Mero Share costs Rs
// 50 a year, a negligible holding cost left out. Orders go online through
// TMS (https://mallastock.com/pages/brokers/services/online).
//
// In the total: the NEPSE book, brokerage on both sides, the SEBON fee on
// both sides, the DP charge on both sides. No remark. Capital gains tax is
// on the gain, not the trade, and is not counted. The sums are in
// ../kumari/nepseDelivery.mjs.
//
// The NEPSE book is not stored and fx.mjs has no NPR rate yet, so the
// total stays unknown until both exist.
//
//   node brokers/mallastock/mallastock_cost.mjs NABIL XNEP NPR --shares=100 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { nepseRoundTrip, printCli } from "../kumari/nepseDelivery.mjs";

const SCHEDULE = {
  broker: "Malla & Malla Stock Broking",
  folder: "mallastock",
  catalogueUrl: new URL("mallastock-parsed.json", import.meta.url),
  url: "https://mallastock.com/pages/brokers/services/trading",
  readOn: "2026-10-21",
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
