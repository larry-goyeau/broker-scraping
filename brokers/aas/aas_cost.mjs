// What one round trip costs at SmartInvest (AAS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://aas.com.vn/khach-hang-ca-nhan/dich-vu-chung-khoan/bieu-phi-dich-vu/
// read on 2026-10-18.
//   Each side  0.15% of the fill, for a listed or registered share or
//              fund certificate. The sheet prints one rate for every
//              channel, online or not.
//   Sale tax   0.1% of the sale, on top of the commission, gain or
//              loss. The sheet prints it ("Thuế bán chứng khoán").
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share or a fund certificate a month. The
//              months are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/aas/aas_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "AAS",
  folder: "aas",
  catalogueUrl: new URL("aas-parsed.json", import.meta.url),
  url: "https://aas.com.vn/khach-hang-ca-nhan/dich-vu-chung-khoan/bieu-phi-dich-vu/",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "un seul taux pour tous les canaux",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
