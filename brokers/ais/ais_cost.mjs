// What one round trip costs at AIS Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.aisec.com.vn/service-tariff
// read on 2026-10-18.
//   Online, each side   0.1% of the fill, ordinary or margin account,
//              from the seventh month. The first six months after the
//              account opens are free of commission except the exchange
//              fee, 0.027% for a share or a fund certificate; that offer
//              is not priced here. Counter or phone is 0.15%.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a security a month. The months are not an
//              input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/ais/ais_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "AIS",
  folder: "ais",
  catalogueUrl: new URL("ais-parsed.json", import.meta.url),
  url: "https://www.aisec.com.vn/service-tariff",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "à partir du septième mois",
  remark: "First six months: 0.07% lower fee. Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
