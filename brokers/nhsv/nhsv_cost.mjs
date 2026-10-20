// What one round trip costs at NH Securities Vietnam (NHSV): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://nhsv.vn/page/bieu-phi.html
// read on 2026-10-18. The sheet applies from 8 October 2025.
//   Online, each side   0.15% of the fill, through Web, Home or Mobile
//              Trading. Other channels: 0.2% to 0.35%, not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The printed rate already includes the fee paid to the exchange.
//              No floor is printed.
//   Custody    free; the depository management fee is 0.27 dong a share
//              a month. The months are not an input, so it stays in the
//              remark. The 0.3 dong a share "transfer to settle" line is
//              VSDC's transfer between depository members, not a sale on
//              the exchange, so it is not added.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/nhsv/nhsv_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "NHSV",
  folder: "nhsv",
  catalogueUrl: new URL("nhsv-parsed.json", import.meta.url),
  url: "https://nhsv.vn/page/bieu-phi.html",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "frais de bourse inclus",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
