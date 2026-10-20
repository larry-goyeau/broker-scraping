// What one round trip costs at Viet Thanh Securities (VTS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://vts.com.vn/bieu-phi-dich-vu.html
// read on 2026-10-18.
//   Each side  the top of the printed range, 0.35% of the fill. The
//              page prints "0.15% - 0.35%" for a share with no rule for
//              where in the range an order falls. The PDF linked from
//              the trading guide prints "0.12% - 0.25%*", undated:
//              https://vts.com.vn/upload/files/Bi%E1%BB%83u%20ph%C3%AD%20d%E1%BB%8Bch%20v%E1%BB%A5%20VTS.pdf
//   Sale tax   0.1% of the sale, on top of the commission, gain or
//              loss. The PDF prints it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share, on the PDF. Not an input, so it stays
//              in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/vts/vts_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VTS",
  folder: "vts",
  catalogueUrl: new URL("vts-parsed.json", import.meta.url),
  url: "https://vts.com.vn/bieu-phi-dich-vu.html",
  readOn: "2026-10-18",
  rate: () => pct("0.35"),
  basis: "le haut de la fourchette 0,15 % à 0,35 %",
  remark: "Commission can be up to 0.2% lower; the sheet does not say when. Custody is 0.27 VND a share.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
