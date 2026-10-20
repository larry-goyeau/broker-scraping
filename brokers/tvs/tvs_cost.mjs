// What one round trip costs at Thien Viet Securities (TVS): buy n shares,
// sell them back, in dollars. A share or an ETF on HOSE, HNX or UPCOM.
// (TVS is not Tan Viet, TVSI, in ../tvsi.)
//
// https://www.tvs.vn/api/files/Bieu_phi_giao_dich_update.pdf
// read on 2026-10-20. It is the "Biểu phí giao dịch" the brokerage page
// (https://www.tvs.vn/vi/moi-gioi) opens.
//   Each side  by the day's matched value, one sheet for every channel:
//              I.  a share ("Cổ phiếu, chứng quyền"):
//                under 500 million dong          0.35%
//                over 500 million                0.30%
//              (the sheet splits the first step at 50 and 100 million,
//              all at 0.35%);
//              II. a fund certificate, an ETF ("Chứng chỉ quỹ"):
//                under 100 million dong          0.35%
//                over 100 million                0.30%
//              Neither table prints a line for exactly 500 or 100
//              million; that value is put in the last step. A footnote
//              offers large clients their own terms, with no rate.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share or fund unit a month, on the same sheet.
//              The months are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/tvs/tvs_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION } from "../../vietnamDelivery.mjs";

const SHARES = {
  broker: "TVS",
  folder: "tvs",
  catalogueUrl: new URL("tvs-parsed.json", import.meta.url),
  url: "https://www.tvs.vn/api/files/Bieu_phi_giao_dich_update.pdf",
  readOn: "2026-10-20",
  rate: tiered([
    [500 * MILLION, pct("0.35"), "lt"],
    [null, pct("0.30")],
  ]),
  basis: "barème unique tous canaux, ligne actions, paliers par valeur du jour",
  remark: "Custody is 0.27 VND a share a month.",
};

const FUNDS = {
  ...SHARES,
  rate: tiered([
    [100 * MILLION, pct("0.35"), "lt"],
    [null, pct("0.30")],
  ]),
  basis: "barème unique tous canaux, ligne certificats de fonds, paliers par valeur du jour",
};

// The listing's type picks the table: an ETF is a fund certificate.
export function roundTrip(query) {
  const answer = vietnamRoundTrip(SHARES, query);
  return answer.listing?.type === "ETF" ? vietnamRoundTrip(FUNDS, query) : answer;
}

printCli(import.meta.url, roundTrip);
