// What First Commerce Credit Union (Tallahassee, Florida) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "Buy and sell more than 6,500 stocks and ETFs
// directly from your app" (in partnership with InvestiFi). It names no list
// and no exception of its own.
//
//   https://www.firstcommercecu.org/investing/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): eligible
// members; personal checking, savings or money market account as the funding
// account; US residents only.
//
// Fees: the page prints none of its own; InvestiFi Securities' Form CRS: "We
// do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/firstcommercecre/firstcommercecre_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "firstcommercecre", {
  "https://www.firstcommercecu.org/investing/": [
    /Buy and sell more than 6,500 stocks and ETFs directly from your app/i,
    /partnered with InvestiFi/i,
  ],
});
