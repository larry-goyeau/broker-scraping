// What one round trip costs at Prime Securities Ltd (發利證券, Hong Kong):
// buy n shares on the Stock Exchange of Hong Kong through its internet or
// mobile platform (2GoTrade) and sell them straight back, in dollars.
//
// http://www.primesec.com.hk/rev1/fee-structure.php?Lang=EN read on
// 2026-10-26, "FEE & CHARGES, Effective from 30th June 2025", "All amount
// in Hong Kong dollars":
//   "Commission (Orders placed via Internet / iPhone / Android App)
//    0.15% Minimum $50.00"                          -> commission, each side
//   "Commission (Phone Trading) 0.25% Minimum $80.00"  -> phone, not priced
//   "Stamp Duty (HK Government) 0.1% Round up to the nearest dollar"
//   "SFC Transaction Levy 0.0027%", "SEHK Trading Fee 0.00565%",
//   "Financial Reporting Council Transaction Levy 0.00015%"
//   "CCASS Settlement Fee 0.01% Minimum $3.00"      -> settlement, each side
// The fund withdrawal form (forms/Fund Withdrawal Form.pdf) asks for a
// "Withdrawal Amount (HKD)": the account is kept in Hong Kong dollars, so a
// USD or RMB (CNH) counter is a forced conversion at a rate Prime does not
// print, and its total stays unknown.
//
// Formula, each side: max(0.15 % x value, 50 HKD) + max(0.01 % x value,
// 3 HKD) + SFC, AFRC and HKEX trading fee (each to the cent) + stamp 0.1 %
// rounded up to the next HKD (none on an ETF or a REIT); plus the HKEX book
// (hk-touch leaf). The sums are in ./hkexCost.mjs.
//
// Left out: custody ("Less than 8,000 lots - free of charge"), the
// registration and transfer fee ($2.00 per lot held over a book close) and
// the dividend collection fee (0.3 %, min $20): holding costs, not trade
// costs. No remark.
//
//   node brokers/primehk/primehk_cost.mjs 00700 XHKG HKD --shares=20 --price=417.8
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip, printCli } from "./hkexCost.mjs";

const SCHEDULE = {
  broker: "Prime Securities",
  folder: "primehk",
  catalogueUrl: new URL("primehk-parsed.json", import.meta.url),
  url: "http://www.primesec.com.hk/rev1/fee-structure.php?Lang=EN",
  readOn: "2026-10-26",
  channel: "ordre en ligne (internet, appli iPhone / Android)",
  commission: { rate: 0.0015, min: 50 },
  settlement: { rate: 0.0001, min: 3, label: "frais de règlement CCASS" },
  perOrder: 0,
  cash: ["HKD"],
  fxEach: null,
  remark: "",
};

export function roundTrip(query) {
  return hkexRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
