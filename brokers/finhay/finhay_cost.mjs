// What one round trip costs at Finhay Securities (FHSC): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://fhsc.com.vn/bieu-phi-giao-dich-tren-finhay
// read on 2026-10-18. The sheet is dated 17 July 2025. The Finhay app is
// the only channel.
//   Each side  0.1% of the fill for a share, "including the fee paid to
//              the exchange". No tier, no floor.
//   Sale clearing fee   0.3 dong a share on each sale ("phí bán thanh
//              toán bù trừ"), no cap printed. It is charged on every sale,
//              so it is in the number.
//   Sale tax   0.1% of the sale, printed on the sheet.
//   Custody    not on this sheet. Open-ended funds sold in the app have
//              their own subscription and redemption fees; they are not
//              exchange lines and are not priced here.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/finhay/finhay_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, perShareOnSale } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Finhay",
  folder: "finhay",
  catalogueUrl: new URL("finhay-parsed.json", import.meta.url),
  url: "https://fhsc.com.vn/bieu-phi-giao-dich-tren-finhay",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "application Finhay, frais de bourse inclus",
  remark: "",
  saleFee: perShareOnSale(0.3),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
