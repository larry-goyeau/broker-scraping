// What one round trip costs at ACBS: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://acbs.com.vn/bieu-phi-giao-dich-chung-khoan-niem-yet
// read on 2026-10-18.
//   Self-directed, each side   by the day's matched value per account,
//              with no account officer ("giao dịch chủ động"):
//                under 100 million dong          0.10%
//                100 to under 250 million        0.09%
//                250 to under 750 million        0.08%
//                750 million and more            0.075%
//              With an adviser the online rate is at most 0.25% under
//              500 million, then 0.20% and 0.15%. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month, from the custody sheet
//              https://acbs.com.vn/bieu-phi-luu-ky-chung-khoan, applied
//              from 1 August 2025. The months are not an input, so it
//              stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/acbs/acbs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "ACBS",
  folder: "acbs",
  catalogueUrl: new URL("acbs-parsed.json", import.meta.url),
  url: "https://acbs.com.vn/bieu-phi-giao-dich-chung-khoan-niem-yet",
  readOn: "2026-10-18",
  rate: tiered([
    [100 * MILLION, pct("0.10"), "lt"],
    [250 * MILLION, pct("0.09"), "lt"],
    [750 * MILLION, pct("0.08"), "lt"],
    [null, pct("0.075")],
  ]),
  basis: "ordre sans conseiller, paliers par valeur du jour",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
