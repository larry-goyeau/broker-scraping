// What one round trip costs at HVS Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://hvsvn.com/bieu-phi
// read on 2026-10-18.
//   Self-directed, each side   0.1% of the fill at every value, for an
//              account with no care officer. With one: 0.3% under 100
//              million dong a day, down to 0.15% over 500 million.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/hvs/hvs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "HVS",
  folder: "hvs",
  catalogueUrl: new URL("hvs-parsed.json", import.meta.url),
  url: "https://hvsvn.com/bieu-phi",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "compte sans chargé de clientèle",
  remark: "Custody is 0.3 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
