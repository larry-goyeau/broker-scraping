// What one round trip costs at Kafi Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://kafi.vn/stock-trading?tab=bpgd
// read on 2026-10-18.
//   Self-directed, each side   0.10% of the fill for a share, a fund
//              certificate, an ETF or a warrant. With an adviser it is
//              0.15%, not priced here. The tab renders in the browser.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/kafi/kafi_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Kafi",
  folder: "kafi",
  catalogueUrl: new URL("kafi-parsed.json", import.meta.url),
  url: "https://kafi.vn/stock-trading?tab=bpgd",
  readOn: "2026-10-18",
  rate: () => pct("0.10"),
  basis: "ordre sans conseiller",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
