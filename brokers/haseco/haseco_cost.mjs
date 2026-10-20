// What one round trip costs at Haiphong Securities (Haseco): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://haseco.vn/bieu-phi-giao-dich/
// read on 2026-10-18. The sheet applies from 1 August 2025.
//   Online, each side   0.18% of the fill ("giao dịch trực tuyến"), a
//              share, a fund certificate or a warrant. Other channels, by
//              the day's value: under 100 million dong 0.35%, then 0.25%,
//              0.20%, and 0.15% from 1 billion. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. The sheet says it
//              is not included in the fees. The rate is the law's.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added. The sheet says VAT, "if any", is not
//              included; brokerage carries none.
//   Custody    0.4 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/haseco/haseco_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Haseco",
  folder: "haseco",
  catalogueUrl: new URL("haseco-parsed.json", import.meta.url),
  url: "https://haseco.vn/bieu-phi-giao-dich/",
  readOn: "2026-10-18",
  rate: () => pct("0.18"),
  basis: "taux unique, hors guichet",
  remark: "Custody is 0.4 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
