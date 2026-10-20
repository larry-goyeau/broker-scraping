// What one round trip costs at Agriseco (Agribank Securities): buy n shares,
// sell them back, in dollars. A share, a fund certificate or an ETF on HOSE,
// HNX or UPCOM.
//
// https://agriseco.com.vn/News/NewsDetail/2057993/vi-VN
// (the notice "Biểu phí dịch vụ và lãi suất cho vay", 09/07/2025, linked
// from https://agriseco.com.vn/ProductsServices/SecuritiesBroker/BrokerageInvestmentConsulting/vi-VN)
// read on 2026-10-18.
//   Online, each side   by the day's matched value ("Giao dịch online"):
//                under 1 billion dong            0.20%
//                1 billion and more              0.15%
//              At the counter or the contact center it is 0.30% under
//              100 million, 0.25% to 500 million, 0.20% to 1 billion,
//              then 0.15%. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month, before VAT. The months are not
//              an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/agriseco/agriseco_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered, BILLION } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Agriseco",
  folder: "agriseco",
  catalogueUrl: new URL("agriseco-parsed.json", import.meta.url),
  url: "https://agriseco.com.vn/News/NewsDetail/2057993/vi-VN",
  readOn: "2026-10-18",
  rate: tiered([
    [1 * BILLION, pct("0.20"), "lt"],
    [null, pct("0.15")],
  ]),
  basis: "ordre en ligne, paliers par valeur du jour",
  remark: "Custody is 0.3 VND a share a month, before VAT.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
