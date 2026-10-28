// What one round trip costs at Apel Asset Limited through Apel Alpha: buy n
// shares (or ETF units) on the Nigerian Exchange and sell them straight
// back, in dollars. Every catalogue line is a naira line and the trading
// account is in naira, so nothing is converted.
//
// https://asset.apel.com.ng/apelalpha read on 2026-10-26:
//   "Reduced brokerage Commission: Trade at 0.50% brokerge [sic]
//    commission" and "Trade at a reduced brokerage commission of 0.50%",
//   "Unlock smarter trading on Apel Alpha with reduced fees".
// So 0.50 % of the consideration on the buy and on the sell. This is below
// the 0.75 % floor of the NGX card's brokerage range; the printed figure is
// kept, as ../atlass keeps its 0.4 % / 0.6 %. No floor and no ticket are
// printed. The page prints no regulatory fees, so they are the NGX card,
// as in ../meristem, through ../morgancapital/ngxCost.mjs:
//   https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
//   Buy  SEC 0.3 %, stamp duty 0.08 %, alert ₦4, VAT 7.5 % of brokerage + SEC
//   Sell NGX 0.3 %, CSCS 0.3 %, stamp duty 0.08 %, alert ₦4,
//        VAT 7.5 % of NGX + CSCS + brokerage
// Brokerage and its 7.5 % VAT are `brokerFees`; the rest of the card is
// `parts.taxes`.
//
// Left out: the page's "Multicurrency global account" is the client's
// wallet and prints no conversion rate; every NGX line is bought in naira.
// Mutual funds are not exchange trades. The book is the NSENG touch from
// spreads/; a missing book stays missing (N/A).
//
//   node brokers/apel/apel_cost.mjs GTCO XNGN NGN --shares=10300 --price=127.7
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

const PAGE = "https://asset.apel.com.ng/apelalpha";
const READ_ON = "2026-10-26";

export const roundTrip = ngxRoundTrip({
  folder: "apel",
  broker: "Apel",
  page: PAGE,
  basis:
    `page Apel Alpha relue le ${READ_ON} : courtage 0,50 % à l'achat et à la vente (sous le plancher de 0,75 % du barème NGX, chiffre publié conservé) ; ` +
    `aucun minimum ni frais fixe ; TVA 7,5 % sur le courtage.`,
  mode: "card",
  buy: 0.005,
  sell: 0.005,
});

ngxCli(import.meta.url, roundTrip);
