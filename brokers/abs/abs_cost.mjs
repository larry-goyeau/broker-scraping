// What one round trip costs at An Binh Securities (ABS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.abs.vn/bieu-phi-giao-dich/
// read on 2026-10-18. The sheet was last updated on 10 July 2025.
//   Self-directed, each side   0.1% of the fill ("giao dịch chủ
//              động"), for an account opened online or at the counter.
//              An account with a broker starts at 0.15% and is not
//              priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    the sheet heads a custody line, but the image under it is
//              the transfer and blocking table. No figure is printed
//              anywhere on abs.vn (searched 2026-10-19), so it stays out.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/abs/abs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "ABS",
  folder: "abs",
  catalogueUrl: new URL("abs-parsed.json", import.meta.url),
  url: "https://www.abs.vn/bieu-phi-giao-dich/",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "ordre sans courtier",
  remark: "",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
