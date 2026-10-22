// What one round trip costs at Xuan Thien Securities (XTSC, Chứng khoán
// Xuân Thiện): buy n shares, sell them back, in dollars. A share or an ETF
// on HOSE, HNX or UPCOM, ordered online.
//
// https://xtsc.vn/bieu-phi
// read on 2026-10-21. The sheet (Bộ biểu phí dịch vụ) was last saved on
// 11 December 2025. Its note says every fee on it includes the 10% VAT.
//   Online, each side   0.15% of the trade value, "Phí giao dịch cp/ ccq/
//              chứng quyền có bảo đảm niêm yết, đăng ký giao dịch qua kênh
//              online", shares, fund certificates and covered warrants on a
//              listed or registered (UPCOM) market. No step and no floor
//              are printed. Other channels (0.15% to 0.25%) are not this
//              ticket.
//   The trading line prints no separate exchange fee, so none is added.
//   Sale transfer   "Chuyển khoản chứng khoán để thực hiện thanh toán":
//              0.3 dong a security, a transfer and a symbol, at most
//              300,000 dong a transfer and a symbol. It is charged on every
//              sale, so it is in the number.
//   Sale tax   0.1% of the trade value, "Thuế bán chứng khoán", printed on
//              the sheet: the personal income tax withheld on every sale.
//   Custody    0.27 dong a share or a fund certificate a month. The months
//              are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only (deposits.mjs), so there is no FX leg. The
// sums are in ../../vietnamDelivery.mjs.
//
// In the total: the book, 0.15% on each side, the sale tax and the sale
// transfer. In the remark: custody.
//
//   node brokers/xtsc/xtsc_cost.mjs VNM HOSE VND --shares=10 --price=57200
//   node brokers/xtsc/xtsc_cost.mjs E1VFVN30 HOSE VND --shares=100 --price=30000
//   node brokers/xtsc/xtsc_cost.mjs SHS HNX VND --shares=1000 --price=15000
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, perShareOnSale } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "XTSC",
  folder: "xtsc",
  catalogueUrl: new URL("xtsc-parsed.json", import.meta.url),
  url: "https://xtsc.vn/bieu-phi",
  readOn: "2026-10-21",
  rate: () => pct("0.15"),
  basis: "barème XTSC TVA incluse, sans frais de bourse séparés",
  remark: "Custody is 0.27 VND a share a month.",
  saleFee: perShareOnSale(0.3, { max: 300_000 }),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
