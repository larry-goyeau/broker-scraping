// What Truity Credit Union (Oklahoma, Kansas, Texas) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "Buy, sell, and hold stocks, ETFs, and
// cryptocurrency" in Truity Digital Banking, "Self-Directed Investing Buy and
// sell stocks and ETFs", through "the InvestiFi digital investing platform".
// It names no list and no exception of its own.
//
//   https://www.truitycu.org/en/services/accountservices/invest
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "Trust
// Account Holders and Commercial Accounts are not supported. Account holders
// residing in TX, ID, or NY are unable to trade" (a client rule, not a title
// rule); minors excluded; US residents only.
//
// Fees: the page prints none of its own; InvestiFi Securities' Form CRS: "We
// do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/truitycreditunio/truitycreditunio_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "truitycreditunio", {
  "https://www.truitycu.org/en/services/accountservices/invest": [
    /Buy, sell, and hold stocks, ETFs, and cryptocurrency/i,
    /InvestiFi digital investing platform/i,
    /Account holders residing in TX, ID, or NY are unable to trade/i,
  ],
});
