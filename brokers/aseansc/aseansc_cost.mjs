// What one round trip costs at ASEAN Securities: buy n shares, sell them
// back, in dollars. A share, a fund certificate or an ETF on HOSE, HNX or
// UPCOM.
//
// https://www.aseansc.com.vn/dich-vu-chung-khoan/bieu-phi-asean/
// (applied from 31/07/2025) read on 2026-10-18.
//   Internet, each side   0.15% of the fill, one rate across every step
//              of the day's value per account ("Giao dịch qua Internet").
//              At the counter or by phone it is 0.33% under 50 million
//              dong, 0.30% to 100 million, 0.25% to 500 million, 0.20% to
//              1 billion, then 0.15%. A segment policy may set anything
//              from 0 to 0.45%. Neither is priced here.
//   Exchange fee and VAT   the sheet says the rate includes the fee paid
//              to the exchange and any VAT, so none is added.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   No floor is printed, so none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/aseansc/aseansc_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "ASEAN Securities",
  folder: "aseansc",
  catalogueUrl: new URL("aseansc-parsed.json", import.meta.url),
  url: "https://www.aseansc.com.vn/dich-vu-chung-khoan/bieu-phi-asean/",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "ordre par internet, frais de bourse et TVA compris",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
