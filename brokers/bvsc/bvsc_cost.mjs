// What one round trip costs at Bao Viet Securities (BVSC): buy n shares,
// sell them back, in dollars. A share, a fund certificate or an ETF on HOSE,
// HNX or UPCOM.
//
// https://www.bvsc.com.vn/danhmuc/dich-vu/khach-hang-ca-nhan/ho-tro/huong-dan-su-dung-dich-vu/bieu-lai-phi-giao-dich/
// read on 2026-10-18.
//   Self-directed, each side   0.12% of the fill, an individual's order
//              placed online from a self-directed account ("tài khoản
//              giao dịch chủ động"), whatever the day's value. Placed
//              through BVSC staff it is 0.40% under 100 million dong a
//              day, 0.35% to 250 million, 0.30% to 350 million, 0.25% to
//              2 billion, then 0.20%. An account managed by a branch or
//              the client desk pays 0.15% online. Neither is priced here.
//              Large clients may get a special rate; not priced either.
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
//   node brokers/bvsc/bvsc_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "BVSC",
  folder: "bvsc",
  catalogueUrl: new URL("bvsc-parsed.json", import.meta.url),
  url: "https://www.bvsc.com.vn/danhmuc/dich-vu/khach-hang-ca-nhan/ho-tro/huong-dan-su-dung-dich-vu/bieu-lai-phi-giao-dich/",
  readOn: "2026-10-18",
  rate: () => pct("0.12"),
  basis: "compte en gestion autonome, ordre en ligne",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
