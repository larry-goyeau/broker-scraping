// What one round trip costs at Viet First Securities (VFS): buy n shares,
// sell them back, in dollars. A share, a fund certificate or an ETF on HOSE,
// HNX or UPCOM.
//
// https://www.vfs.com.vn/dich-vu-chung-khoan-khach-hang-ca-nhan/bieu-phi
// read on 2026-10-18.
//   Each side  0.15% of the fill, "Giao dịch chứng khoán niêm yết", one
//              rate for every channel and every value.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month, collected for VSDC. The months
//              are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/vfs/vfs_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VFS",
  folder: "vfs",
  catalogueUrl: new URL("vfs-parsed.json", import.meta.url),
  url: "https://www.vfs.com.vn/dich-vu-chung-khoan-khach-hang-ca-nhan/bieu-phi",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "taux unique pour une valeur cotée",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
