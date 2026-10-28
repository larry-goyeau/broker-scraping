// What one round trip costs at Upbest Securities (美建證券, Hong Kong): buy
// n shares on the Stock Exchange of Hong Kong through its internet trading
// platform and sell them straight back, in dollars.
//
// http://upbest.com/en/support/select.html read on 2026-10-26, "Buy & Sell
// Charges" (Hong Kong dollars):
//   "Brokerage (only for internet trade) 0.175% or $50.00 – Min"
//                                                    -> commission, each side
//   "Brokerage (by phone) 0.25% or $100.00 – Min"    -> phone, not priced
//   "Stamp Duty $1/$1,000 ($1 per $1,000)"           -> 0.1 %, rounded up
//   "Trading Fee 0.00565%", "Transaction Levy 0.0027%",
//   "FRC Transaction Levy 0.00015%"
//   "Handling Fee 0.02% $2.00 – Min $200.00 – Max"  -> settlement, each side
// The payment section lists HKD accounts and an RMB one ("A/C No.
// 364469-057 (RMB)"), so cash is kept in HKD and CNH. A USD counter is a
// forced conversion at a rate Upbest does not print: its total stays
// unknown.
//
// Formula, each side: max(0.175 % x value, 50 HKD) + min(200, max(0.02 % x
// value, 2 HKD)) + SFC, AFRC and HKEX trading fee (each to the cent) +
// stamp 0.1 % rounded up to the next HKD (none on an ETF or a REIT); plus
// the HKEX book (hk-touch leaf). The sums are in ../primehk/hkexCost.mjs.
//
// Left out: "Transfer Deed $5.00 per lot" (the government fee on a physical
// transfer deed, not on a CCASS trade), the scrip fee ($1.50 per lot) and
// dividend charges: not trade costs. No remark.
//
//   node brokers/upbest/upbest_cost.mjs 00700 XHKG HKD --shares=20 --price=417.8
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip, printCli } from "../primehk/hkexCost.mjs";

const SCHEDULE = {
  broker: "Upbest Securities",
  folder: "upbest",
  catalogueUrl: new URL("upbest-parsed.json", import.meta.url),
  url: "http://upbest.com/en/support/select.html",
  readOn: "2026-10-26",
  channel: "ordre en ligne (plateforme internet)",
  commission: { rate: 0.00175, min: 50 },
  settlement: { rate: 0.0002, min: 2, max: 200, label: "frais de traitement" },
  perOrder: 0,
  cash: ["HKD", "CNH"],
  fxEach: null,
  remark: "",
};

export function roundTrip(query) {
  return hkexRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
