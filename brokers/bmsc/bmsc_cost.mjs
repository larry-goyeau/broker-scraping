// What one round trip costs at Bao Minh Securities (BMSC): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://bmsc.com.vn/dich-vu-chung-khoan/Bieu-phi.html
// read on 2026-10-18. The page cites the BMSC fee notice of 1 November
// 2023.
//   Online, each side   0.15% of the fill ("giao dịch qua internet"), a
//              share, a warrant or a fund certificate. At the counter:
//              under 200 million dong 0.25%, 200 million to under
//              1 billion 0.2%, 1 billion and more 0.15%. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/bmsc/bmsc_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "BMSC",
  folder: "bmsc",
  catalogueUrl: new URL("bmsc-parsed.json", import.meta.url),
  url: "https://bmsc.com.vn/dich-vu-chung-khoan/Bieu-phi.html",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "ordre par internet",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
