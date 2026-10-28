// What one round trip costs at JB Securities Vietnam (JBSV): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://wts.finavi.com.vn/s3/files/static/Bieu_phi_JBSV.pdf
// (linked from https://jbsv.com.vn/) read on 2026-10-18. The sheet
// applies from 6 August 2025.
//   Online, each side   the top of the printed range, 0.15% of the fill.
//              The sheet prints "0,027% – 0,15%" for a listed or UPCOM
//              security online, including the exchange fee, with no rule
//              for where in the range an order falls. At the counter or by
//              phone it is 0.15%. The remark is the bottom of the range
//              as a cut of the commission: 0.15% → 0.027% = 82% lower.
//   Sale transfer fee   0.3 dong a share on each sale, at most 300,000
//              dong per stock and per transfer ("phí chuyển khoản khi bán
//              chứng khoán", item III.2.2). It is charged on every sale,
//              so it is in the number.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   No floor is printed.
//   Custody    free; the depository management fee is 0.3 dong a share
//              a month. The months are not an input, so it is left out.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/jbsv/jbsv_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, perShareOnSale } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "JBSV",
  folder: "jbsv",
  catalogueUrl: new URL("jbsv-parsed.json", import.meta.url),
  url: "https://wts.finavi.com.vn/s3/files/static/Bieu_phi_JBSV.pdf",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "le haut de la fourchette 0,027 % à 0,15 %, frais de bourse inclus",
  remark: "Commission can be up to 82% lower; the sheet does not say when.",
  saleFee: perShareOnSale(0.3, { max: 300_000 }),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
