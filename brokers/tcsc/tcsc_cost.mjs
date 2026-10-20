// What one round trip costs at Thanh Cong Securities (TCSC): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://tcsc.vn/vi/support
// read on 2026-10-18. The sheet applies from 27 July 2026.
//   Online, each side   0.15% of the fill through TCiPro or TCiSmart.
//              Otherwise 0.25% up to 300 million dong a day, 0.20% to
//              700 million, then 0.15%.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a security a month. The months are not an
//              input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/tcsc/tcsc_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "TCSC",
  folder: "tcsc",
  catalogueUrl: new URL("tcsc-parsed.json", import.meta.url),
  url: "https://tcsc.vn/vi/support",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "via TCiPro ou TCiSmart",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
