// What one round trip costs at Viet Dragon Securities (Rong Viet, VDSC):
// buy n shares, sell them back, in dollars. A share or an ETF on HOSE, HNX
// or UPCOM, ordered online.
//
// https://www.vdsc.com.vn/ca-nhan/bieu-phi (tab "Chứng khoán cơ sở"),
// read on 2026-10-21. Each table's caption is printed under it.
//   Self-directed, each side   0.1% of the fill, "Giao dịch chủ động -
//              Dịch vụ etaDragon", whatever the day's value. An account
//              managed by an investment adviser ("Giao dịch có Chuyên viên
//              Tư vấn đầu tư quản lý") pays 0.25% under 200 million dong a
//              day, 0.22% to 500 million, 0.20% to 1 billion, 0.18% to 2
//              billion, then 0.15%; not priced here. The account-opening
//              page (https://account.vdsc.com.vn/) offers free trading for
//              the first three months, a time-limited offer, not this sheet.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. The sheet does not
//              print it; the rate is the law's.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added. Online services (iDragon, goDragon) are free
//              ("Dịch vụ khác" tab).
//   Custody    0.27 dong a share or a fund certificate a month, paid to
//              VSDC, VAT not included ("Dịch vụ lưu ký" tab,
//              https://www.vdsc.com.vn/ca-nhan/bieu-phi/dich-vu-luu-ky-z4).
//              The months are not an input, so it stays in the remark.
//              The 0.3 dong a share VSDC transfer on that tab is for a
//              transfer out of the account, not a sale.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/vdsc/vdsc_cost.mjs VNM HOSE VND --shares=100 --price=57200
//   node brokers/vdsc/vdsc_cost.mjs E1VFVN30 HOSE VND --shares=100 --price=30000
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VDSC",
  folder: "vdsc",
  catalogueUrl: new URL("vdsc-parsed.json", import.meta.url),
  url: "https://www.vdsc.com.vn/ca-nhan/bieu-phi",
  readOn: "2026-10-21",
  rate: () => pct("0.1"),
  basis: "giao dịch chủ động (service etaDragon, compte autonome), 0,1 % quel que soit le montant du jour",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
