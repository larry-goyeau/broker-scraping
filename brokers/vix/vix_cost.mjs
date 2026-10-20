// What one round trip costs at VIX Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://vixs.vn/ho-tro/bieu-phi-dich-vu-giao-dich-chung-khoan
// read on 2026-10-18. The sheet applies from 13 July 2026 (decision 36/2026/VIX/QĐ-TGĐ).
//   Online, each side   0.15% of the fill at every value of the day.
//              At the counter or by phone: 0.3% under 100 million dong,
//              down to 0.15% from 1 billion.
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
//   node brokers/vix/vix_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VIX",
  folder: "vix",
  catalogueUrl: new URL("vix-parsed.json", import.meta.url),
  url: "https://vixs.vn/ho-tro/bieu-phi-dich-vu-giao-dich-chung-khoan",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
