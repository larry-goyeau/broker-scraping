// What one round trip costs at KB Securities Vietnam (KBSV): buy n shares,
// sell them back, in dollars. A share or an ETF on HOSE, HNX or UPCOM,
// ordered online.
//
// https://www.kbsec.com.vn/pic/general/files/KBSV_Schedule%20of%20fees_EN.pdf
// read on 2026-10-20. The schedule applies from 1 August 2025 to domestic
// and foreign clients. It is the file the fee page links
// (https://www.kbsec.com.vn/vi/bieu-phi-dich-vu-chung-khoan.htm, which
// would not load in full that day).
//   Online, each side   "Placing orders online (KB Buddy, KB Buddy WTS,
//              …) 0.15% -0.2% of trading value", stocks, fund units and
//              covered warrants. The sheet does not say which client
//              pays which end, so the figure is the top of the range,
//              0.20%, and the remark is the gap to the bottom. Other
//              channels (0.25% under 300 million dong a day, 0.20% from
//              there) are not this ticket. KB Bestie and KB Zero Fee are
//              time-limited offers, not this sheet.
//   Sale tax   0.1% of the sale, the personal income tax the schedule's
//              footnote says individuals pay. The rate is the law's.
//   The equity line prints no separate exchange fee and no floor, so
//              none is added.
//   Sale transfer   "Securities transfer fees incurred to effect payment:
//              VND 0.5/symbol", at most 500,000 dong a service and a
//              symbol. Read as 0.5 dong a share sold, as the Mirae and KIS
//              sheets word their 0.3 dong line; it is in the number.
//   Custody    0.3 dong a share or a fund certificate a month. The months
//              are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/kbsvn/kbsvn_cost.mjs VNM HOSE VND --shares=100 --price=57200
//   node brokers/kbsvn/kbsvn_cost.mjs E1VFVN30 HOSE VND --shares=100 --price=30000
//   node brokers/kbsvn/kbsvn_cost.mjs SHS HNX VND --shares=1000 --price=15000
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, perShareOnSale } from "../../vietnamDelivery.mjs";

const TOP = pct("0.20");
const BOTTOM = pct("0.15");

const SCHEDULE = {
  broker: "KBSV",
  folder: "kbsvn",
  catalogueUrl: new URL("kbsvn-parsed.json", import.meta.url),
  url: "https://www.kbsec.com.vn/pic/general/files/KBSV_Schedule%20of%20fees_EN.pdf",
  readOn: "2026-10-20",
  rate: () => TOP,
  basis: "ordre en ligne (KB Buddy), haut de la fourchette 0,15 % à 0,2 % du barème du 1er août 2025",
  remark: [
    `Online commission can be ${Number(((TOP - BOTTOM) * 100).toFixed(2))}% lower.`,
    "Custody is 0.3 VND a share a month.",
  ].join("\n"),
  saleFee: perShareOnSale(0.5, { max: 500_000 }),
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
