// What one round trip costs at Funan Securities (FNS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://funan.com.vn/vi/page/bieu-phi-va-chinh-sach-khach-hang.5417
// read on 2026-10-18. The page prints no date.
//   Online, each side   0.15% of the fill, through Mobile Trading,
//              Home Trading or Web Trading, for a share, a fund
//              certificate, a warrant or a listed bond, on the day's value.
//              Other channels: under 100 million dong 0.30%, then 0.25%,
//              0.20%, and 0.15% from 1 billion. Not priced here.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.3 dong a share a month, waived when a month's charge is
//              under 500 dong. The months are not an input, so it stays
//              in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/funan/funan_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "FNS",
  folder: "funan",
  catalogueUrl: new URL("funan-parsed.json", import.meta.url),
  url: "https://funan.com.vn/vi/page/bieu-phi-va-chinh-sach-khach-hang.5417",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "Mobile, Home ou Web Trading",
  remark: "Custody is 0.3 VND a share a month, waived under 500 VND.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
