// What one round trip costs at Quantum Zenith Securities & Investments
// (QZSIL) through its E-Business Suite: buy n shares (or ETF units) on the
// Nigerian Exchange and sell them straight back, in dollars. Every
// catalogue line is a naira line and the account is in naira, so nothing
// is converted.
//
// https://quantumzenithsecurities.com.ng/faqs/ read on 2026-10-26, "What
// are the charges for doing trades through Quantum Zenith Securities Ltd
// (QZSIL) on the Stock Exchange.": "Our total charge for buying is 1.665%
// and selling is 2.010% of the value of the transaction."
// "Total charge" is all-in: the FAQ does not split it into brokerage, VAT
// and the NGX card, so the two rates are counted whole in brokerFees and
// nothing from the card
// (https://ngxgroup.com/exchange/trade/equities/trading-market-structure/)
// is added on top, as in ../stanbicibtc, through
// ../morgancapital/ngxCost.mjs in mode "allIn". No alert, floor or ticket
// is printed outside the two rates.
//
// Left out: the ₦1,000 inter-member transfer charge moves an account from
// another broker and is not a trade. Treasury bills and bonds are not
// exchange share trades. The book is the NSENG touch from spreads/; a
// missing book stays missing (N/A).
//
//   node brokers/quantumzenith/quantumzenith_cost.mjs GTCO XNGN NGN --shares=10300 --price=127.7
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

const PAGE = "https://quantumzenithsecurities.com.ng/faqs/";
const READ_ON = "2026-10-26";

export const roundTrip = ngxRoundTrip({
  folder: "quantumzenith",
  broker: "Quantum Zenith",
  page: PAGE,
  basis:
    `FAQ QZSIL relue le ${READ_ON} : frais totaux 1,665 % à l'achat et 2,010 % à la vente de la valeur de la transaction, ` +
    `tout compris : rien du barème NGX n'est ajouté ; aucun minimum, frais fixe ni alerte à part.`,
  mode: "allIn",
  buy: 0.01665,
  sell: 0.0201,
});

ngxCli(import.meta.url, roundTrip);
