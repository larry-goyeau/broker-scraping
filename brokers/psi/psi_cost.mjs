// What one round trip costs at PetroVietnam Securities (PSI): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.psi.vn/vi/san-pham/khach-hang-ca-nhan/dich-vu-chung-khoan/bieu-phi
// read on 2026-10-18.
//   Each side  by the day's value, Vietnamese or foreign individual:
//                under 100 million dong          0.30%
//                100 to under 500 million        0.25%
//                500 million to under 1 billion  0.20%
//                1 billion and more              0.15%
//              No separate online rate is printed.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/psi/psi_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, MILLION, BILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "PSI",
  folder: "psi",
  catalogueUrl: new URL("psi-parsed.json", import.meta.url),
  url: "https://www.psi.vn/vi/san-pham/khach-hang-ca-nhan/dich-vu-chung-khoan/bieu-phi",
  readOn: "2026-10-18",
  rate: tiered([
    [100 * MILLION, pct("0.30"), "lt"],
    [500 * MILLION, pct("0.25"), "lt"],
    [1 * BILLION, pct("0.20"), "lt"],
    [null, pct("0.15")],
  ]),
  basis: "particulier, un seul barème pour tous les canaux, paliers par valeur du jour",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
