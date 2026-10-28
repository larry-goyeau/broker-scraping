// What one round trip costs at Alpha Securities (APSC): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://apsc.vn/khach-hang-ca-nhan/bieu-phi
// read on 2026-10-18. The sheet applies from 4 August 2026. The tables
// open in the browser; the text is in the page's payload. No separate
// online rate is printed.
//   Each side  by the day's matched value, a share, a fund certificate,
//              an ETF or a covered warrant:
//                under 100 million dong          0.30%
//                100 million to under 1 billion  0.25%
//                1 billion and more              0.20%
//              A newly opened account pays 0.15% for a period APSC may
//              change at any time; that offer is not priced here. The
//              remark gives it as a cut of this order's step (0.30% →
//              0.15% = 50% lower).
//   Sale transfer fee   0.3 dong a share for the shares sold on the
//              exchange ("chuyển khoản chứng khoán bán thực hiện giao dịch
//              qua SGDCK", item V.1), at least 100,000 dong a transfer
//              and at most 300,000 dong per stock. It is charged on every
//              sale, so it is in the number.
//   Sale tax   0.1% of the sale; the sheet says personal income tax is
//              not included in its fees. The rate is the law's.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month. The months are not an input,
//              so it is left out.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/apsc/apsc_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, perShareOnSale, MILLION, BILLION } from "../../vietnamDelivery.mjs";

const NEW_ACCOUNT = pct("0.15");

const SCHEDULE = {
  broker: "APSC",
  folder: "apsc",
  catalogueUrl: new URL("apsc-parsed.json", import.meta.url),
  url: "https://apsc.vn/khach-hang-ca-nhan/bieu-phi",
  readOn: "2026-10-18",
  rate: tiered([
    [100 * MILLION, pct("0.30"), "lt"],
    [1 * BILLION, pct("0.25"), "lt"],
    [null, pct("0.20")],
  ]),
  basis: "paliers par valeur du jour, tous canaux",
  // The new-account rate, as a cut of this order's step.
  remark: (rate) => {
    const x = ((rate - NEW_ACCOUNT) / rate) * 100;
    return `New account, for a limited time: ${x >= 10 ? Math.round(x) : Number(x.toFixed(1))}% lower fee.`;
  },
  saleFee: perShareOnSale(0.3, { min: 100_000, max: 300_000 }),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
