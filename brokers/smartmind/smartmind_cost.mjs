// What one round trip costs at SmartMind Securities (SMDS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.smartmind.vn/bieu-phi-dich-vu-chung-khoan/
// read on 2026-10-18. The sheet applies from 20 October 2025.
//   Self-directed, each side   0.05% of the fill for a direct Mass or
//              VIP client ("giao dịch chủ động"), a share, a fund
//              certificate or a warrant, domestic or foreign client.
//              Through an sPartner introducer it is 0.15%; not priced
//              here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month, VSDC's. The months are not an
//              input, so it stays in the remark. The 1 dong a share
//              "transfer to settle" line is a transfer between depository
//              members, not a sale on the exchange, so it is not added.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/smartmind/smartmind_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "SMDS",
  folder: "smartmind",
  catalogueUrl: new URL("smartmind-parsed.json", import.meta.url),
  url: "https://www.smartmind.vn/bieu-phi-dich-vu-chung-khoan/",
  readOn: "2026-10-18",
  rate: () => pct("0.05"),
  basis: "client direct sans apporteur (giao dịch chủ động)",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
