// What one round trip costs at Newdevco Investment & Securities: buy n
// shares (or ETF units) on the Nigerian Exchange and sell them straight
// back, in dollars. The account is in naira and every listing is a naira
// line, so nothing is converted.
//
// https://www.newdevcoinvestment.com/ read on 2026-10-26: the "NewDevCo
// Calculator" on every page of the site prints, for a buy,
//   "Alert + VAT #4.20", "Brokerage 1.35%", "SEC Fees 0.3%",
//   "Contract Stamps 0.075%"
// and for a sale
//   "Alert + VAT #4.20", "Brokerage 1.35%", "NSE Fees 0.3%", "CSCS 0.3%",
//   "Contract Stamps 0.075%".
// Newdevco's own fee is the brokerage, 1.35% of the consideration a side
// (the top of the card's 0.75–1.35% range). No floor and no ticket are
// printed. The other lines are the statutory card in an old form (stamp
// duty 0.075%, an alert taken with 5% VAT, no VAT on the SEC / NGX / CSCS
// fees and none on brokerage), so they are replaced by today's NGX equities
// card, as in ../meristem,
// https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
// read on 2026-10-26:
//   Buy     SEC 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of brokerage and the SEC fee
//   Sell    NGX 0.3%, CSCS 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of the NGX fee, the CSCS fee and brokerage
// Brokerage and its 7.5% VAT are `brokerFees`; the rest of the card sits in
// `parts.taxes`. Orders go online through the client portal
// https://www.newdevcoonline.com/IW (sign-up open), at the same calculator
// rates; the site's own e-trading page is "under construction".
//
// Left out: nominee/custodian and advisory services are not this trip.
// The Nigerian book is read from spreads/ (ngx-touch); a missing book
// stays missing.
//
//   node brokers/newdevco/newdevco_cost.mjs GTCO XNGN NGN --shares=10300 --price=128.25
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

export const roundTrip = ngxRoundTrip({
  folder: "newdevco",
  broker: "Newdevco",
  page: "https://www.newdevcoinvestment.com/",
  basis:
    "Calculateur NewDevCo (relu le 2026-10-26) : courtage 1,35 % de la contrepartie à l'achat et à la vente, " +
    "sans minimum ni frais fixe ; TVA 7,5 % sur le courtage (les autres lignes du calculateur sont l'ancien barème de place).",
  mode: "card",
  buy: 0.0135,
  sell: 0.0135,
});

ngxCli(import.meta.url, roundTrip);
