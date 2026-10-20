// What one round trip costs at Maybank Securities Vietnam (MSVN): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.maybank-kimeng.com.vn/securities/customer-support/faqs/11-0/vi
// read on 2026-10-18. The sheet applies from 1 July 2025 (domestic
// individual and institutional clients). The page renders in the browser;
// the table is in its payload.
//   Self-directed, each side   0.12% of the fill ("giao dịch chủ
//              động", an account run by the online business centre), any
//              day's value, a share, a fund certificate, an ETF or a
//              warrant. With an adviser: 0.15% online, 0.22% by phone,
//              0.25% to 0.12% through the adviser, the last two plus the
//              exchange fee. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   Exchange fee   0.027% (listed share) or 0.018% (UPCOM, ETF, warrant),
//              added only on the phone and adviser columns (*); the
//              self-directed rate carries no such mark, so none is added.
//              No floor is printed.
//   Custody    0.27 dong a share a month, waived when a month's charge
//              is under 1,000 dong. The months are not an input, so it
//              stays in the remark. The 0.3 dong a share "transfer to
//              settle" line is a transfer between depository members,
//              not a sale on the exchange, so it is not added.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/maybankvn/maybankvn_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "MSVN",
  folder: "maybankvn",
  catalogueUrl: new URL("maybankvn-parsed.json", import.meta.url),
  url: "https://www.maybank-kimeng.com.vn/securities/customer-support/faqs/11-0/vi",
  readOn: "2026-10-18",
  rate: () => pct("0.12"),
  basis: "ordre sans conseiller (giao dịch chủ động)",
  remark: "Custody is 0.27 VND a share a month, waived under 1,000 VND.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
