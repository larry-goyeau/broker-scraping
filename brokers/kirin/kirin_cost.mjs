// What one round trip costs at Kirin Capital Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://kirins.vn/bieu-phi-dich-vu-chung-khoan/
// read on 2026-10-18. The sheet is in force from 10 July 2025.
//   Online, each side   0.15% of the fill. Other channels: 0.30% under
//              100 million dong a day, 0.25% to 500 million, then
//              0.20%.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a security a month, before VAT. The months
//              are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/kirin/kirin_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Kirin",
  folder: "kirin",
  catalogueUrl: new URL("kirin-parsed.json", import.meta.url),
  url: "https://kirins.vn/bieu-phi-dich-vu-chung-khoan/",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "",
  remark: "Custody is 0.27 VND a share a month plus VAT.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
