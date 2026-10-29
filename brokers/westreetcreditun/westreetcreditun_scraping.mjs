// What WeStreet Credit Union (Tulsa, Oklahoma) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): its investment portal FAQ: "your financial
// institution has partnered with InvestiFi Securities LLC ... as your
// registered broker dealer", "InvestiFi Securities currently limits all buy
// and sell orders to market orders"; the how-to page: buying and selling
// stocks through the portal. It names no list and no exception of its own.
//
//   https://westreet.org/member-resource/securities-in-the-investment-portal-faq/
//   https://westreet.org/member-resource/how-to-buy-and-sell-stocks-through-the-investment-portal/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): market
// orders only, market hours only; purchases from checking accounts only;
// members in good standing.
//
// Fees: the FAQ prints none; InvestiFi Securities' Form CRS: "We do not
// charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/westreetcreditun/westreetcreditun_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "westreetcreditun", {
  "https://westreet.org/member-resource/securities-in-the-investment-portal-faq/": [
    /partnered with InvestiFi Securities LLC/i,
    /InvestiFi Securities currently limits all buy and sell orders to market orders/i,
  ],
  "https://westreet.org/member-resource/how-to-buy-and-sell-stocks-through-the-investment-portal/": [
    /open a brokerage account with InvestiFi Securities LLC/i,
  ],
});
