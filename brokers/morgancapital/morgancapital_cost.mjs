// What one round trip costs at MorganCapital Securities through iTrade: buy
// n shares (or ETF units) on the Nigerian Exchange and sell them straight
// back, in dollars. The account and its wallet are in naira and every
// catalogue line is a naira line, so nothing is converted.
//
// Morgan Capital prints two brokerage figures, read on 2026-10-26:
//   https://www.morgancapitalgroup.com/faq, "What does trading cost?":
//     "Brokerage of 1.35% plus small statutory levies (NGX 0.03%, SEC
//      0.03%, CSCS 0.06%) and VAT on the brokerage and CSCS portions —
//      about 1.58% all-in, itemised on every ticket before you confirm."
//   https://www.morgancapitalgroup.com/learn, "Fees, explained": a worked
//     ₦100,000 buy, "Brokerage Morgan Capital's commission 1.35%
//     ₦1,350.00", and "Selling carries the same schedule".
//   https://www.morgancapitalgroup.com/itrade: "0.75% brokerage Among the
//     lowest commissions charged in the Nigerian market, with no hidden
//     platform fee", "place buy and sell instructions against live NGX
//     prices at 0.75% brokerage".
// The two figures are the two ends of the NGX card's 0.75–1.35 % range and
// the site does not say when each applies. As with a discretionary range,
// the higher one is charged: 1.35 % a side, the rate of the itemised ticket
// in the worked example. The 0.75 % is the remark ((1.35 - 0.75) / 1.35 =
// 44 % off the brokerage, buy and sell together). No floor and no ticket fee
// are printed; opening, funding, holding and dividends "cost nothing".
//
// The levies in the worked example (NGX 0.03 %, SEC 0.03 %, CSCS 0.06 %, no
// stamp duty, no alert) are not the exchange's card and are not used. The
// statutory part is the NGX card, as in ../meristem, through ./ngxCost.mjs:
//   https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
//   Buy  SEC 0.3 %, stamp duty 0.08 %, alert ₦4, VAT 7.5 % of brokerage + SEC
//   Sell NGX 0.3 %, CSCS 0.3 %, stamp duty 0.08 %, alert ₦4,
//        VAT 7.5 % of NGX + CSCS + brokerage
// Brokerage and its VAT are `brokerFees`; the rest of the card is
// `parts.taxes`.
//
// Left out: the diaspora funding in USD, GBP or EUR "at the live rate"
// (FAQ) is converted to naira before any trade and prints no margin; this
// round trip starts from naira. Bonds, T-bills, IPOs and funds are not
// exchange trades. The book is the NSENG touch from spreads/; a missing
// book stays missing (N/A).
//
//   node brokers/morgancapital/morgancapital_cost.mjs GTCO XNGN NGN --shares=10300 --price=127.7
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "./ngxCost.mjs";

const PAGE = "https://www.morgancapitalgroup.com/faq";
const READ_ON = "2026-10-26";

export const roundTrip = ngxRoundTrip({
  folder: "morgancapital",
  broker: "Morgan Capital",
  page: PAGE,
  basis:
    `FAQ et guide Morgan Capital relus le ${READ_ON} : courtage 1,35 % à l'achat et à la vente (exemple chiffré du ticket) ; ` +
    `la page iTrade annonce 0,75 %, sans dire quand il s'applique : le taux le plus haut est retenu, l'écart est en remarque ; ` +
    `aucun minimum ni frais fixe ; TVA 7,5 % sur le courtage. Les prélèvements de l'exemple (0,03 %, 0,06 %) ne sont pas ceux du barème NGX, qui est retenu.`,
  mode: "card",
  buy: 0.0135,
  sell: 0.0135,
  remark: "Fees might be 44% lower.",
});

ngxCli(import.meta.url, roundTrip);
