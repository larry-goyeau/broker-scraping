// What one round trip costs at Yuanta Securities Vietnam (YSVN): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://support.yuanta.com.vn/support/bieu-phi-va-lai-suat/bieu-phi-dich-vu-moi-gioi-chung-khoan/
// read on 2026-10-18. The sheet applies from 22 December 2025.
//   Self-directed, each side   0.1% of the fill, for a client served by
//              the digital sales desk with no broker. A brokered account
//              pays 0.15% online and 0.30% to 0.15% otherwise.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share or a fund certificate a month. The
//              months are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/yuantavn/yuantavn_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Yuanta",
  folder: "yuantavn",
  catalogueUrl: new URL("yuantavn-parsed.json", import.meta.url),
  url: "https://support.yuanta.com.vn/support/bieu-phi-va-lai-suat/bieu-phi-dich-vu-moi-gioi-chung-khoan/",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "client autonome sans courtier",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
