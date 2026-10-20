// What one round trip costs at Phu Hung Securities (PHS): buy n shares, sell them back,
// in dollars. A share, a fund certificate or an ETF on HOSE, HNX or UPCOM.
//
// https://www.phs.vn/san-pham-dich-vu/bieu-phi-dich-vu-dau-tu-chu-dong/67
// read on 2026-10-19. The sheet applies from 1 December 2023.
//   Online, each side   0.1% of the fill, the self-directed service
//              ("Dịch vụ Đầu tư chủ động"), with no account officer. Any
//              client opening online (eKYC) can pick it by answering
//              "Không đăng ký" to the account-officer question, which is
//              pre-set to register.
//              https://www.phs.vn/san-pham-dich-vu/gioi-thieu-dich-vu-dau-tu-chu-dong/65
//   With an officer, the main sheet (applies from 30 March 2026)
//              charges 0.2% online, 0.4% through the call centre, 0.4%
//              to 0.3% at the counter or through the officer, and 0.15%
//              "qua Internet Broker", a line PHS defines nowhere. None is
//              priced here.
//              https://www.phs.vn/san-pham-dich-vu/bieu-phi-giao-dich-chung-khoan-co-so-26
//   Sale tax   0.1% of the sale, on top of the commission, gain or
//              loss. The sheet prints it, collected for the tax office.
//   The cash line prints no separate exchange fee and no floor, so
//              none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/phs/phs_cost.mjs VNM HOSE VND --shares=10 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct } from "../../vietnamDelivery.mjs";

const SCHEDULE = {
  broker: "PHS",
  folder: "phs",
  catalogueUrl: new URL("phs-parsed.json", import.meta.url),
  url: "https://www.phs.vn/san-pham-dich-vu/bieu-phi-dich-vu-dau-tu-chu-dong/67",
  readOn: "2026-10-19",
  rate: () => pct("0.1"),
  basis: "Đầu tư chủ động, sans chargé de compte",
  remark: "Custody is 0.27 VND a share a month.",
};

export function roundTrip(query) {
  return vietnamRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
