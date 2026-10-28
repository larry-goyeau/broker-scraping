// What one round trip costs at Integrated Trust & Investment Limited through
// ITI Trade: buy n shares (or ETF units) on the Nigerian Exchange and sell
// them straight back, in dollars. Every catalogue line is a naira line and
// the trading account is in naira, so nothing is converted.
//
// https://integratedtrustng.com/forms/Application-Form-Guide-to-Online-Trading.pdf
// read on 2026-10-26 (Word file created 2021-03-26), "5. FEES & CHARGES:
// Our fees and charges for ITI Trade services are divided into two stages
// as stated below: SELL CHARGES – 2.255% Buy Charges – 1.88%".
// Both are all-in figures: they sit above the NGX card at its 1.35 % top
// brokerage (1.85375 % + ₦4 on a buy, 2.17625 % + ₦4 on a sell), and the
// guide does not split them into brokerage, VAT and the card. So they are
// counted whole in brokerFees and nothing from the card
// (https://ngxgroup.com/exchange/trade/equities/trading-market-structure/)
// is added on top, as in ../stanbicibtc, through
// ../morgancapital/ngxCost.mjs in mode "allIn". No alert, floor or ticket
// is printed outside the two rates.
//
// Left out: fixed income is not an exchange share trade. The book is the
// NSENG touch from spreads/; a missing book stays missing (N/A).
//
//   node brokers/integratedtrust/integratedtrust_cost.mjs GTCO XNGN NGN --shares=10300 --price=127.7
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

const PAGE = "https://integratedtrustng.com/forms/Application-Form-Guide-to-Online-Trading.pdf";
const READ_ON = "2026-10-26";

export const roundTrip = ngxRoundTrip({
  folder: "integratedtrust",
  broker: "Integrated Trust",
  page: PAGE,
  basis:
    `guide ITI Trade relu le ${READ_ON} : frais 1,88 % à l'achat et 2,255 % à la vente, tout compris ` +
    `(au-dessus du barème NGX à 1,35 % de courtage) : rien du barème NGX n'est ajouté ; aucun minimum, frais fixe ni alerte à part.`,
  mode: "allIn",
  buy: 0.0188,
  sell: 0.02255,
});

ngxCli(import.meta.url, roundTrip);
