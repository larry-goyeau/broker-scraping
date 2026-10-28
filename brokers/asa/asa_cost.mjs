// What one round trip costs at ASA Securities (富國證券, Hong Kong): buy n
// shares on the Stock Exchange of Hong Kong through its online trading
// system and sell them straight back, in dollars.
//
// https://asasec.com/tc/securities_fee_and_commision.php read on
// 2026-10-26, "證券交易服務" (one tariff, no channel split):
//   "佣金 0.25%；最低港幣100元 按買賣成交金額計算"   -> commission, each side
//   "交易徵費（證監會） 0.0027%", "交易徵費（財匯局） 0.00015%",
//   "交易費（港交所） 0.00565%"
//   "中央結算系統交收費 0.005%；最低港幣5元"        -> CCASS settlement, each side
//   "印花稅 每港幣1,000 成交額收取港幣1元 成交額不足1,000亦作港幣1元計算"
//                                                    -> 0.1 %, rounded up
//   "股票託管費 免費" (custody free)
// Every amount is in Hong Kong dollars and the deposit page
// (https://asasec.com/tc/fund.php: cheque, online banking or remittance to
// the firm's bank) names no other currency; the account-opening page asks
// for a Hong Kong bank account. A USD or RMB (CNH) counter is a forced
// conversion at a rate ASA does not print: its total stays unknown.
//
// Formula, each side: max(0.25 % x value, 100 HKD) + max(0.005 % x value,
// 5 HKD) + SFC, AFRC and HKEX trading fee (each to the cent) + stamp 0.1 %
// rounded up to the next HKD (none on an ETF or a REIT); plus the HKEX book
// (hk-touch leaf). The sums are in ../primehk/hkexCost.mjs.
//
// Left out: the share registration fee (港幣2.5元 per lot held over a book
// close), dividend collection (0.5 %, min 20) and the mailed-statement fee
// (港幣50元 a month, paper statements only): not trade costs. No remark.
//
//   node brokers/asa/asa_cost.mjs 00700 XHKG HKD --shares=20 --price=417.8
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip, printCli } from "../primehk/hkexCost.mjs";

const SCHEDULE = {
  broker: "ASA Securities",
  folder: "asa",
  catalogueUrl: new URL("asa-parsed.json", import.meta.url),
  url: "https://asasec.com/tc/securities_fee_and_commision.php",
  readOn: "2026-10-26",
  channel: "ordre en ligne (barème unique, tous canaux)",
  commission: { rate: 0.0025, min: 100 },
  settlement: { rate: 0.00005, min: 5, label: "frais de règlement CCASS" },
  perOrder: 0,
  cash: ["HKD"],
  fxEach: null,
  remark: "",
};

export function roundTrip(query) {
  return hkexRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
