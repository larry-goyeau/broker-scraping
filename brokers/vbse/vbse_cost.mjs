// What one round trip costs at VietinBank Securities (VBSE): buy n shares,
// sell them back, in dollars. A share, a fund certificate or an ETF on HOSE,
// HNX or UPCOM.
//
// https://www.vbse.vn/khach-hang-ca-nhan/bieu-phi/
// read on 2026-10-18.
//   Internet, each side   0.10% of the fill. The sheet prints "Theo hạng
//              khách hàng, từ 0,1%- 0,15%" for an internet order: the rate
//              follows a class the broker assigns (not a paid plan), and
//              the page does not say which class pays what. The notice of
//              29 December 2023 gives a newly opened account 0.1% online
//              from 3 January 2024, with no end date, so that is priced.
//              https://www.vbse.vn/uu-dai-phi-giao-dich-cho-khach-hang-mo-moi-tai-khoan-tai-cong-ty-chung-khoan-cong-thuong/ At the counter or by phone it is 0.30% up to
//              250 million dong a day per sub-account, 0.275% to 400
//              million, 0.25% to 500 million, 0.20% to 1 billion, then
//              0.15%. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.4 dong a share a month, VAT included (waived when the
//              month's custody is under 1,000 dong). The months are not
//              an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/vbse/vbse_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VBSE",
  folder: "vbse",
  catalogueUrl: new URL("vbse-parsed.json", import.meta.url),
  url: "https://www.vbse.vn/khach-hang-ca-nhan/bieu-phi/",
  readOn: "2026-10-18",
  rate: () => pct("0.10"),
  basis: "ordre par internet, 0,1 % pour un compte nouvellement ouvert (avis du 29/12/2023) ; la fourchette 0,1 % à 0,15 % suit le rang du client",
  remark: "Custody is 0.4 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
