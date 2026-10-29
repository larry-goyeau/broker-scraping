// What Create Credit Union (Las Vegas, Nevada) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "Self-Directed Investing This option lets you
// buy and sell stocks and Exchange Traded Funds (ETFs) directly from your
// checking account" and "you have access to a variety of stocks and ETFs
// similarly found through major brokerages", through InvestiFi Securities. It
// names no list and no exception of its own.
//
//   https://www.createcu.org/invest/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): members
// only; US residents only.
//
// Fees: the page prints none of its own (its member fee schedule has no
// trading line); InvestiFi Securities' Form CRS: "We do not charge
// commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/createcreditunio/createcreditunio_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "createcreditunio", {
  "https://www.createcu.org/invest/": [
    /lets you buy and sell stocks and Exchange Traded Funds \(ETFs\) directly from your checking account/i,
    /InvestiFi Securities/,
  ],
});
