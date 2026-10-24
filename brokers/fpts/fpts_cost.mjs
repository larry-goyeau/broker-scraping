// What one round trip costs at FPT Securities (FPTS, Chứng khoán FPT): buy
// n shares, sell them back, in dollars. A share or an ETF on HOSE, HNX or
// UPCOM, ordered online.
//
// https://www.fpts.com.vn/ho-tro-khach-hang/dich-vu-tai-chinh/bieu-phi-dich-vu/giao-dich-chung-khoan-co-so/
// read on 2026-10-24. The sheet prints no effective date. Its tables are
// images: brokerage is /media/11692/brokerage01.png, custody
// /media/11693/custody.png, depository transfers
// /media/11687/stock-transfer01.png (the 300920261-3.png images on that
// page are the margin and cash-advance rates, not trading fees).
//   Self-directed, each side   0.03% of the trade value, "Giao dịch chủ
//              động - Mức phí cố định", shares, fund certificates, ETFs
//              and covered warrants, at every value. No floor is printed.
//              An account with a trading assistant ("Có chuyên viên hỗ trợ
//              giao dịch") pays 0.085% under 1 billion dong down to 0.030%
//              from 10 billion; not priced here.
//   Exchange fee   the text under the table says the brokerage already
//              includes the fee paid to the exchanges (0.027% on shares
//              and listed fund certificates, 0.018% on covered warrants,
//              ETFs and UPCOM shares), so none is added. Brokerage is not
//              subject to VAT.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. The sheet does not
//              print it; the rate is the law's.
//   The 0.3 dong a share VSDC line is a transfer to another depository
//              member, not a sale, so there is no sale transfer fee.
//   Custody    0.27 dong a share, fund certificate or covered warrant a
//              month. The months are not an input, so it stays in the
//              remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only (deposits.mjs), so there is no FX leg. The
// sums are in ../../vietnamDelivery.mjs.
//
// In the total: the book, 0.03% on each side and the sale tax. In the
// remark: custody.
//
//   node brokers/fpts/fpts_cost.mjs VNM HOSE VND --shares=100 --price=57200
//   node brokers/fpts/fpts_cost.mjs E1VFVN30 HOSE VND --shares=100 --price=30000
//   node brokers/fpts/fpts_cost.mjs SHS HNX VND --shares=1000 --price=15000
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "FPTS",
  folder: "fpts",
  catalogueUrl: new URL("fpts-parsed.json", import.meta.url),
  url: "https://www.fpts.com.vn/ho-tro-khach-hang/dich-vu-tai-chinh/bieu-phi-dich-vu/giao-dich-chung-khoan-co-so/",
  readOn: "2026-10-24",
  rate: () => pct("0.03"),
  basis: "giao dịch chủ động (taux fixe, frais de bourse inclus, non soumis à la TVA)",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
