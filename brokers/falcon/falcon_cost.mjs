// What one round trip costs at Falcon Securities Limited through FS Online:
// buy n shares (or ETF units) on the Nigerian Exchange and sell them
// straight back, in dollars. Every catalogue line is a naira line and the
// account is in naira, so nothing is converted.
//
// https://www.falconsecuritiesltd.com/brokage.html read on 2026-10-26: the
// Stock Broking page prints no rate, only a "Stock Calculator" that
// itemises "NGX, CSCS Fee, Trade Alert Fee, SEC Fee, Stamp Duty, Brokerage
// Fee". Its script, https://www.aptsecurities.com/js/calculator.js (the
// host of the site's template), charges
//   brokerage  "considerationAmount * 1.35 * 0.01"   both sides
//   alert 4, SEC 0.3 % on a buy, NGX 0.3 % + CSCS 0.3 % on a sell,
//   "stampDuty" considerationAmount * 0.3 * 0.01, and no VAT.
// Only the brokerage, 1.35 % a side, is Falcon's own figure. The script's
// 0.3 % stamp duty is the SEC/NGX rate copied onto the stamp line of a
// shared template, and it leaves out VAT: the statutory part is the
// exchange's card instead, as in ../meristem, through
// ../morgancapital/ngxCost.mjs:
//   https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
//   Buy  SEC 0.3 %, stamp duty 0.08 %, alert ₦4, VAT 7.5 % of brokerage + SEC
//   Sell NGX 0.3 %, CSCS 0.3 %, stamp duty 0.08 %, alert ₦4,
//        VAT 7.5 % of NGX + CSCS + brokerage
// Brokerage and its 7.5 % VAT are `brokerFees`; the rest of the card is
// `parts.taxes`. No floor and no ticket are printed.
//
// Left out: bonds, treasury bills, NASD OTC and private equity are not NGX
// share trades. The book is the NSENG touch from spreads/; a missing book
// stays missing (N/A).
//
//   node brokers/falcon/falcon_cost.mjs GTCO XNGN NGN --shares=10300 --price=127.7
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

const PAGE = "https://www.falconsecuritiesltd.com/brokage.html";
const READ_ON = "2026-10-26";

export const roundTrip = ngxRoundTrip({
  folder: "falcon",
  broker: "Falcon",
  page: PAGE,
  basis:
    `calculatrice de la page Stock Broking Falcon relue le ${READ_ON} : courtage 1,35 % à l'achat et à la vente ; ` +
    `aucun minimum ni frais fixe ; TVA 7,5 % sur le courtage (la calculatrice l'omet et met le timbre à 0,3 % : le barème NGX est retenu pour ces lignes).`,
  mode: "card",
  buy: 0.0135,
  sell: 0.0135,
});

ngxCli(import.meta.url, roundTrip);
