// What Northwest Federal Credit Union (Herndon, Virginia) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "We've partnered with InvestiFi to provide you
// a new investment portal" and "You can buy, sell, and hold cryptocurrencies,
// stocks and exchange-traded funds (ETFs) with no additional apps to
// download". It names no list and no exception of its own.
//
//   https://www.nwfcu.org/membership/member-benefits/investifi/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "Commercial
// accounts and trust accounts are not supported"; account holders over 18 in
// good standing.
//
// Fees: the page prints none of its own; InvestiFi Securities' Form CRS: "We
// do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/northwestfederal/northwestfederal_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "northwestfederal", {
  "https://www.nwfcu.org/membership/member-benefits/investifi/": [
    /We've partnered with InvestiFi/i,
    /buy, sell, and hold cryptocurrencies, stocks and exchange-traded funds/i,
  ],
});
