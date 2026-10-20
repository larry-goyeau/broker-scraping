// What one round trip costs at Tan Viet Securities (TVSI): buy n shares,
// sell them back, in dollars. A share, a fund certificate or an ETF on HOSE,
// HNX or UPCOM.
//
// https://www.tvsi.com.vn/fee-stock.html
// read on 2026-10-18.
//   Each side  by the day's matched value, "Tất cả các kênh giao dịch"
//              (every channel, online included):
//                under 100 million dong          0.300%
//                100 to under 300 million        0.275%
//                300 million to under 1 billion  0.250%
//                1 to 2 billion                  0.200%
//                over 2 billion                  0.150%
//              The page prints this one package, with an account
//              manager; it prints no cheaper self-directed line.
//   Exchange fee  the sheet says the rate already includes the fee paid
//              to the exchange, so none is added.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   No floor is printed, so none is added.
//   Custody    0.27 dong a share a month, on the other-services sheet
//              (https://www.tvsi.com.vn/fee-other.html). The months are
//              not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/tvsi/tvsi_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION, BILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "TVSI",
  folder: "tvsi",
  catalogueUrl: new URL("tvsi-parsed.json", import.meta.url),
  url: "https://www.tvsi.com.vn/fee-stock.html",
  readOn: "2026-10-18",
  rate: tiered([
    [100 * MILLION, pct("0.300"), "lt"],
    [300 * MILLION, pct("0.275"), "lt"],
    [1 * BILLION, pct("0.250"), "lt"],
    [2 * BILLION, pct("0.200"), "le"],
    [null, pct("0.150")],
  ]),
  basis: "tous canaux, paliers par valeur du jour, frais de bourse compris",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
