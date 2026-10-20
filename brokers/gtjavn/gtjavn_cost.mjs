// What one round trip costs at Guotai Haitong Securities (Viet Nam), ex GTJA: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://gtht.com.vn/bieu-phi-dich-vu/
// read on 2026-10-18.
//   Online, each side   0.15% of the fill, through iweb, GTJA mobile
//              or home trading. At the counter or by phone: 0.25% under
//              100 million dong, 0.2% to 500 million, then 0.15%.
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
//   node brokers/gtjavn/gtjavn_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Guotai Haitong",
  folder: "gtjavn",
  catalogueUrl: new URL("gtjavn-parsed.json", import.meta.url),
  url: "https://gtht.com.vn/bieu-phi-dich-vu/",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
