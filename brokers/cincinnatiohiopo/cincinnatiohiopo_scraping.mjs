// What Cincinnati Ohio Police Federal Credit Union (COPFCU) sells in shares
// and exchange-traded funds, with no login. Its online investing is
// InvestiFi's portal inside its digital banking (broker InvestiFi Securities
// LLC, custodian RQD Clearing LLC): "COPFCU has partnered with InvestiFi to
// provide eligible members with access to digital investing", "Build Your
// Portfolio with Stocks & ETFs"; its stocks page: "eligible COPFCU members
// can buy and sell stocks and ETFs". It names no list and no exception of its
// own.
//
//   https://copfcu.com/resources/digital-investing/
//   https://copfcu.com/resources/stocks-etf-investing-copfcu/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "Commercial
// accounts and trust accounts are not supported. Account holders residing in
// TX, ID, or NY are unable to trade" (a client rule, not a title rule);
// members over 18 in good standing.
//
// Fees: the pages print none of their own; InvestiFi Securities' Form CRS:
// "We do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/cincinnatiohiopo/cincinnatiohiopo_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "cincinnatiohiopo", {
  "https://copfcu.com/resources/digital-investing/": [
    /COPFCU has partnered with InvestiFi/i,
    /Build Your Portfolio with Stocks & ETFs/i,
    /Account holders residing in TX, ID, or NY are unable to trade/i,
  ],
  "https://copfcu.com/resources/stocks-etf-investing-copfcu/": [
    /buy and sell stocks and ETFs/i,
  ],
});
