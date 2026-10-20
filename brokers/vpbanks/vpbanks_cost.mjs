// What one round trip costs at VPBank Securities (VPBankS): buy n shares,
// sell them back, in dollars. A share or an ETF on HOSE, HNX or UPCOM.
//
// https://www.vpbanks.com.vn/ho-tro?category=bieu-phi-dich-vu&type=post&item=giao-dich-co-phieuchung-chi-quychung-quyen-co-bao-dam-ap-dung-cho-chung-khoan-niem-yet-va-dang-ky-giao-dich-1758078170803
// read on 2026-10-20 (the site is behind a bot check; read in Chrome).
//   Each side  "Khách hàng không lựa chọn nhân viên chăm sóc" (a client
//              with no account manager, self-directed): 0.1% of the
//              matched value, from 01/7/2025. One flat rate, no steps.
//              The account-manager line (0.15% to 0.3%) is not this
//              account.
//   Exchange fee  the sheet says the fee paid to the exchange (at most
//              0.027%) is already in the 0.1%, so none is added.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it; the ePortfolio sheet of the same site prints the
//              same 0.1%, and the rate is the law's.
//   No floor is printed, so none is added.
//   Custody    0.3 dong a share a month, on the cash-securities services
//              sheet (https://www.vpbanks.com.vn/ho-tro?category=bieu-phi-dich-vu&type=post&item=bieu-phi-dich-vu-chung-khoan-co-so),
//              read on 2026-10-20. The months are not an input, so it
//              stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/vpbanks/vpbanks_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, tiered } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "VPBankS",
  folder: "vpbanks",
  catalogueUrl: new URL("vpbanks-parsed.json", import.meta.url),
  url: "https://www.vpbanks.com.vn/ho-tro?category=bieu-phi-dich-vu&type=post&item=giao-dich-co-phieuchung-chi-quychung-quyen-co-bao-dam-ap-dung-cho-chung-khoan-niem-yet-va-dang-ky-giao-dich-1758078170803",
  readOn: "2026-10-20",
  rate: tiered([[null, pct("0.1")]]),
  basis: "client sans conseiller, taux unique, frais de bourse compris",
  remark: "Custody is 0.3 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
