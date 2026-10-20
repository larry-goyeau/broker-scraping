// What one round trip costs at LPBank Securities (LPS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.lpbs.com.vn/bieu-phi-san-pham-dich-vu-support19
// read on 2026-10-18.
//   Self-directed, each side   0.1% of the fill, every channel and
//              every listed security, for a client with no care officer.
//              With one it is 0.15%. A new account trades free for 30
//              days except the exchange fee (Zero Fee); not priced here.
//              The sheet prints no exchange fee; the remark uses the
//              0.027% AIS prints, so -0.073%.
//              https://www.lpbs.com.vn/san-pham-zero-fee-lpbs18
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The printed rate already includes the fee paid to the exchange.
//              No floor is printed.
//   Custody    0.27 dong a share a month, before VAT. The months are
//              not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/lpbs/lpbs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "LPS",
  folder: "lpbs",
  catalogueUrl: new URL("lpbs-parsed.json", import.meta.url),
  url: "https://www.lpbs.com.vn/bieu-phi-san-pham-dich-vu-support19",
  readOn: "2026-10-18",
  rate: () => pct("0.1"),
  basis: "client sans chargé de clientèle, frais de bourse inclus",
  remark: "First 30 days: 0.07% lower fee. Custody is 0.27 VND a share a month plus VAT.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
