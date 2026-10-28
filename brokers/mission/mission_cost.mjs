// What one round trip costs at Mission Securities: buy n shares (or ETF
// units) on the Nigerian Exchange and sell them straight back, in dollars.
// The account is in naira and every listing is a naira line, so nothing is
// converted.
//
// https://www.missionsecuritiesltd.com/professional_fees.html read on
// 2026-10-26, "Our Professional Fees":
//   Buy   "Brokerage Commission 1.35% of Consideration", VAT on brokerage
//         5%, CSCS 0.06%, stamp duties 0.075%, SEC 0.3%, "TOTAL 1.8555%"
//   Sell  brokerage 1.35%, VAT 5%, CSCS 0.36%, stamp duties 0.075%,
//         NSE 0.3%, "TOTAL 2.1855%" (its own lines add up to 2.1905%)
//   "It is only the broker's commission that is negotiable and this
//    largely depends on the volume and frequency of trade."
// Mission's own fee is the brokerage, 1.35% of the consideration a side
// (the top of the card's 0.75–1.35% range). No floor and no ticket are
// printed. The page itself calls the other lines "the statutory charges",
// and they are an old card (VAT 5%, stamp duty 0.075%, CSCS 0.06% / 0.36%),
// so they are replaced by today's NGX equities card rather than taking the
// page's totals as all-in rates, as in ../meristem,
// https://ngxgroup.com/exchange/trade/equities/trading-market-structure/
// read on 2026-10-26:
//   Buy     SEC 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of brokerage and the SEC fee
//   Sell    NGX 0.3%, CSCS 0.3%, stamp duty 0.08%, trade alert ₦4,
//           VAT 7.5% of the NGX fee, the CSCS fee and brokerage
// That gives 1.85375% + ₦4 on a buy and 2.17625% + ₦4 on a sale, within
// 0.01 point of the page's own totals. Brokerage and its 7.5% VAT are
// `brokerFees`; the rest of the card sits in `parts.taxes`. Orders go
// online through the "MSI trading portal" (https://mission.xcloudintegra.com/).
//
// Left out: the negotiable commission prints no figure. The opening
// minimum ("A minimum of N50, 000.00 or its equivalent in stock" in the
// FAQ, "N5m" on the fees page) is a deposit, not a fee. Share transfer and certificate forms are not a trade.
// The Nigerian book is read from spreads/ (ngx-touch); a missing book
// stays missing.
//
//   node brokers/mission/mission_cost.mjs GTCO XNGN NGN --shares=10300 --price=128.25
//
// `roundTrip(...)` reads files, not the network.

import { ngxRoundTrip, ngxCli } from "../morgancapital/ngxCost.mjs";

export const roundTrip = ngxRoundTrip({
  folder: "mission",
  broker: "Mission Securities",
  page: "https://www.missionsecuritiesltd.com/professional_fees.html",
  basis:
    "« Our Professional Fees » de Mission Securities (relu le 2026-10-26) : courtage 1,35 % de la contrepartie " +
    "à l'achat et à la vente, sans minimum ni frais fixe ; TVA 7,5 % sur le courtage (les autres lignes de la page " +
    "sont l'ancien barème de place, TVA 5 %).",
  mode: "card",
  buy: 0.0135,
  sell: 0.0135,
});

ngxCli(import.meta.url, roundTrip);
