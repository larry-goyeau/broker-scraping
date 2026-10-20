// What one round trip costs at Artex Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://artex.vn/CustomerSupport/Tradingfee
// read on 2026-10-18. The sheet applies from 9 September 2025.
//   Each side  by the day's matched value, any channel:
//                under 100 million dong          0.25%
//                100 to under 500 million        0.20%
//                over 500 million                0.15%
//              The sheet prints no line for exactly 500 million; it is
//              put in the last step. No separate online rate is printed.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/artex/artex_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Artex",
  folder: "artex",
  catalogueUrl: new URL("artex-parsed.json", import.meta.url),
  url: "https://artex.vn/CustomerSupport/Tradingfee",
  readOn: "2026-10-18",
  rate: tiered([
    [100 * MILLION, pct("0.25"), "lt"],
    [500 * MILLION, pct("0.20"), "lt"],
    [null, pct("0.15")],
  ]),
  basis: "un seul barème pour tous les canaux, paliers par valeur du jour",
  remark: "Custody is 0.3 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
