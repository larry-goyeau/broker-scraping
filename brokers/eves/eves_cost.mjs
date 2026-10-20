// What one round trip costs at Everest Securities (EVS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://eves.com.vn/san-pham-dich-vu/bieu-phi/bieu-phi-dich-vu/
// read on 2026-10-18. The sheet is dated 1 July 2025.
//   Online, each side   by the day's value per account:
//                under 5 billion dong            0.15%
//                5 to under 10 billion           0.14%
//                10 to under 20 billion          0.13%
//                20 to under 30 billion          0.12%
//                30 to under 50 billion          0.11%
//                50 billion and more             0.10%
//              At the counter or by phone: 0.25%, 0.20%, 0.15%.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.297 dong a share a month. The months are not an
//              input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/eves/eves_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, BILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "EVS",
  folder: "eves",
  catalogueUrl: new URL("eves-parsed.json", import.meta.url),
  url: "https://eves.com.vn/san-pham-dich-vu/bieu-phi/bieu-phi-dich-vu/",
  readOn: "2026-10-18",
  rate: tiered([
    [5 * BILLION, pct("0.15"), "lt"],
    [10 * BILLION, pct("0.14"), "lt"],
    [20 * BILLION, pct("0.13"), "lt"],
    [30 * BILLION, pct("0.12"), "lt"],
    [50 * BILLION, pct("0.11"), "lt"],
    [null, pct("0.10")],
  ]),
  basis: "paliers par valeur du jour",
  remark: "Custody is 0.297 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
