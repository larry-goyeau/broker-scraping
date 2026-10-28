// What one round trip costs at Beta Securities (BETA, bsi.com.vn): buy n
// shares, sell them back, in dollars. A share, a fund certificate or an ETF
// on HOSE, HNX or UPCOM.
//
// https://www.bsi.com.vn/vn/san-pham-dich-vu/bieu-phi-dich-vu
// (applied from 24/07/2026; the page body comes from
// https://www.bsi.com.vn/api/getPageByLink?link=bieu-phi-dich-vu)
// read on 2026-10-18.
//   Each side  the top of the printed classes, 0.15% of the fill, the
//              Silver class. The sheet prices a listed share, a fund
//              certificate or a warrant by client class: Diamond 0.06%,
//              Platinum 0.10%, Gold 0.12%, Silver 0.15%. The notice of
//              27 March 2026 sets the classes by the month's trading value
//              or margin debt, in billions of dong: Gold 10 / 2, Platinum
//              25 / 5, Diamond 50 / 10; Silver has no requirement, so a new
//              client is Silver. The lower classes are in the remark, as
//              the cut of the 0.15% (Gold 20%, Platinum 33%, Diamond 60%).
//              It names no separate online rate.
//              https://www.bsi.com.vn/vn/tin-tuc/tin-va-su-kien/thong-bao-dieu-chinh-lai-suat-vay-margin
//   VAT        the sheet says its fees are before VAT "if any"; brokerage
//              is outside VAT in Vietnam, so none is added.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. The sheet points to
//              the law for it.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.4 dong a share a month. The months are not an input, so
//              it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/bsi/bsi_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "BETA",
  folder: "bsi",
  catalogueUrl: new URL("bsi-parsed.json", import.meta.url),
  url: "https://www.bsi.com.vn/vn/san-pham-dich-vu/bieu-phi-dich-vu",
  readOn: "2026-10-18",
  rate: () => pct("0.15"),
  basis: "classe Silver, le haut des taux par rang de client",
  remark: "If more than 10 billion VND traded or 2 billion VND margin debt in the month, fees are 20% lower; more than 25 / 5 billion, 33% lower; more than 50 / 10 billion, 60% lower. Custody is 0.4 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
