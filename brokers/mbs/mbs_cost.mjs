// What one round trip costs at MB Securities (MBS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://mbs.com.vn/bieu-phi-giao-dich-chung-khoan-co-so/
// read on 2026-10-18.
//   Self-directed, each side   0.08% of the fill, with no broker
//              managing the account. MD24 (0.12%) is the "Gói cổ phiếu"
//              basket in the MBBank app: a mandate sub-account where the
//              system copies an expert's orders. A
//              brokered account runs 0.3% to 0.15% online by the day's
//              value. Neither is priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The printed rate already includes the fee paid to the exchange.
//              No floor is printed.
//   Custody    0.3 dong a share a month, from the "Biểu phí lưu ký
//              chứng khoán" tab of https://mbs.com.vn/bieu-phi-khac/ ,
//              which prints no date. The same tab charges 0.3 dong a
//              share, at most 300,000 dong a ticker, on the transfer that
//              settles a sale; it is charged on every sale, so it is in the
//              number. Custody is in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/mbs/mbs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, perShareOnSale } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "MBS",
  folder: "mbs",
  catalogueUrl: new URL("mbs-parsed.json", import.meta.url),
  url: "https://mbs.com.vn/bieu-phi-giao-dich-chung-khoan-co-so/",
  readOn: "2026-10-18",
  rate: () => pct("0.08"),
  basis: "client autonome sans courtier, frais de bourse inclus",
  remark: "Custody is 0.3 VND a share a month.",
  saleFee: perShareOnSale(0.3, { max: 300_000 }),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
