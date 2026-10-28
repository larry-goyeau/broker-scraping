// What one round trip costs at Banco Well Link (立橋銀行, Macau): buy n
// shares on the Stock Exchange of Hong Kong through the bank's mobile app
// (electronic order) and sell them straight back, in dollars.
//
// https://www.wlbank.com.mo/webfile/upload/2026/07-10/17-17-290757397616718.pdf
// read on 2026-10-26, "Hong Kong Stock Trade-Related Services", July 2026
// (the PDF is images; read from the rendered page):
//   "Online 0.028% of Turnover Amount (Minimum HK$28, whichever is higher)"
//                                                    -> commission, each side
//   "Telephone Dial-in (Odd lot sell order only) 0.25% of Turnover Amount
//    (Minimum HK$100, whichever is higher)"
//   "Stamp Duty Charge 0.1% on gross amount (rounded up to the nearest
//    dollar)"
//   "Transaction Levy (SFC) Charge 0.0027%", "Trading Levy (HKEx) Charge
//    0.00565%", "FRC Transaction Levy Charge 0.00015%" (each "rounded to
//    the nearest cent")
//   "Settlement Fee Charge 0.005% on gross amount (including 0.0042%
//    Charged by CCASS) (Minimum: HK$5)"              -> settlement, each side
//   Note: "For odd lot trade order, only selling order is provided and it
//   must be executed via dial-in telephone order and trade commission for
//   such transactions is charged accordingly."
// So the online trade is a whole number of board lots. The trade is priced
// on its value at the online rate (like the other HK files); the odd-lot
// rule is the remark. Every amount is in Hong Kong dollars and no page
// names another settlement currency for the securities account, so a USD
// or RMB (CNH) counter is a forced conversion at a rate the bank does not
// print for this service: its total stays unknown.
//
// Formula, each side: max(0.028 % x value, 28 HKD) + max(0.005 % x value,
// 5 HKD) + SFC, AFRC and HKEX trading fee (each to the cent) + stamp 0.1 %
// rounded up to the next HKD (none on an ETF or a REIT); plus the HKEX book
// (hk-touch leaf). The sums are in ../primehk/hkexCost.mjs.
//
// Left out: the scrip fee (HK$2 per board lot, CCASS), the CCASS fee of
// HK$0.8 per board lot on corporate actions and dividend collection (0.5 %,
// min HK$30): not trade costs. No custody fee ("免存倉費",
// https://www.wlbank.com.mo/template/biztwocolorTemplate.html?id=267).
//
//   node brokers/bancowelllink/bancowelllink_cost.mjs 00700 XHKG HKD --shares=20 --price=417.8
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip, printCli } from "../primehk/hkexCost.mjs";

const SCHEDULE = {
  broker: "Banco Well Link",
  folder: "bancowelllink",
  catalogueUrl: new URL("bancowelllink-parsed.json", import.meta.url),
  url: "https://www.wlbank.com.mo/webfile/upload/2026/07-10/17-17-290757397616718.pdf",
  readOn: "2026-10-26",
  channel: "ordre électronique (appli)",
  commission: { rate: 0.00028, min: 28 },
  settlement: { rate: 0.00005, min: 5, label: "frais de règlement" },
  perOrder: 0,
  cash: ["HKD"],
  fxEach: null,
  remark: "Odd lots can only be sold, at 0.25% (min HKD 100).",
};

export function roundTrip(query) {
  return hkexRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
