// What one round trip costs at Shinhan Securities Vietnam (SSV): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://shinhansec.com.vn/vi/ho-tro-khach-hang/phi-giao-dich.html
// read on 2026-10-18. The sheet is in force from 14 October 2026.
//   Online, each side   0.15% of the fill for a domestic client, at
//              every value (MTS, HTS, WTS). A foreign client pays 0.1%
//              online. At the counter: 0.3% under 100 million dong,
//              0.25% to 1 billion, then 0.15%.
//   Sale tax   0.1% of the sale, on top of the commission, gain or
//              loss. The sheet prints it ("Thuế TNCN").
//   The printed rate already includes the fee paid to the exchange.
//              No floor is printed.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/shinhanvn/shinhanvn_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "Shinhan",
  folder: "shinhanvn",
  catalogueUrl: new URL("shinhanvn-parsed.json", import.meta.url),
  url: "https://shinhansec.com.vn/vi/ho-tro-khach-hang/phi-giao-dich.html",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "client résident, frais de bourse inclus",
  remark: "A foreign client's fee is 0.05% lower online. Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
