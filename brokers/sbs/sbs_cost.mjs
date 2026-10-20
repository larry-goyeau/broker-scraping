// What one round trip costs at Sacombank Securities (SBS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://sbsc.com.vn/ho-tro/bieu-phi-dich-vu/
// read on 2026-10-18.
//   Each side  by the day's value, any channel:
//                up to 500 million dong          0.40%
//                over 500 million to 1.5 billion 0.35%
//                over 1.5 to 2.5 billion         0.30%
//                over 2.5 billion                0.25%
//              No separate online rate is printed and the page is not
//              dated.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month, collected for VSDC. The
//              months are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/sbs/sbs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION, BILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "SBS",
  folder: "sbs",
  catalogueUrl: new URL("sbs-parsed.json", import.meta.url),
  url: "https://sbsc.com.vn/ho-tro/bieu-phi-dich-vu/",
  readOn: "2026-10-18",
  rate: tiered([
    [500 * MILLION, pct("0.40"), "le"],
    [1.5 * BILLION, pct("0.35"), "le"],
    [2.5 * BILLION, pct("0.30"), "le"],
    [null, pct("0.25")],
  ]),
  basis: "un seul barème pour tous les canaux, paliers par valeur du jour",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
