// What one round trip costs at Dai Viet Securities (DVSC): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://dvsc.com.vn/
// read on 2026-10-18.
//   Each side  0.15% of the fill for a listed share, fund certificate
//              or covered warrant. The table "Biểu phí giao dịch chứng
//              khoán niêm yết" sits on the home page, with one rate and
//              no online line. No dated sheet was found.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    not printed anywhere on dvsc.com.vn (searched 2026-10-19,
//              news back to 2012 included), so it stays out.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/dvsc/dvsc_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "DVSC",
  folder: "dvsc",
  catalogueUrl: new URL("dvsc-parsed.json", import.meta.url),
  url: "https://dvsc.com.vn/",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "un seul taux, tableau de la page d'accueil",
  remark: "",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
