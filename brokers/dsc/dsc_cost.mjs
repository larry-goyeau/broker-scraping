// What one round trip costs at DSC Securities: buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.dsc.com.vn/bieu-phi
// (listed and UPCOM sheet, applied from 20/08/2025) read on 2026-10-18.
//   Digital account, each side   0.10% of the fill, whatever the value,
//              for an account managed by the digital advisory desk
//              ("khối Tư vấn số"), the online account. An account managed
//              by a broker pays 0.30% under 100 million dong a day, 0.25%
//              to 300 million, 0.20% to 500 million, then 0.15%. Not
//              priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month. The months are not an input, so
//              it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/dsc/dsc_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "DSC",
  folder: "dsc",
  catalogueUrl: new URL("dsc-parsed.json", import.meta.url),
  url: "https://www.dsc.com.vn/bieu-phi",
  readOn: "2026-10-18",
  rate: () => pct("0.10"),
  basis: "compte suivi par le pôle de conseil numérique",
  remark: "Custody is 0.3 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
