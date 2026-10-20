// What one round trip costs at Saigon-Hanoi Securities (SHS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://shs.com.vn/ho-tro/bieu-phi
// read on 2026-10-18. The page lists the sheet under 19 August 2026.
//   Online, each side   0.15% of the fill ("giao dịch trực tuyến").
//              Otherwise 0.35% under 100 million dong a day, down to
//              0.15% over 1 billion.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it. The rate is the law's; the AAS, PHS and Shinhan
//              sheets print it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    not on this sheet. The service sheet "Biểu phí dịch vụ",
//              applied from 1 July 2025, prints 0.297 dong a share a
//              month, VAT included. The months are not an input, so it
//              stays in the remark.
//              https://s3-storage.shs.com.vn/shs-website/Sites/QuoteVN/SiteRoot/documents/2025/Bieu%20Phi%20Dich%20Vu.pdf
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/shs/shs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "SHS",
  folder: "shs",
  catalogueUrl: new URL("shs-parsed.json", import.meta.url),
  url: "https://shs.com.vn/ho-tro/bieu-phi",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "",
  remark: "Custody is 0.297 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
