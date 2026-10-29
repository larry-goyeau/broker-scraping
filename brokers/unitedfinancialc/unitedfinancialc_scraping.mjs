// What United Financial Credit Union (Saginaw, Michigan) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "We have partnered with InvestiFi ... to buy,
// sell, and hold stocks", and "Only equity securities are offered through
// InvestiFi's platform". It names no list and no exception of its own.
//
//   https://www.unitedfinancialcu.org/invest/securities/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "CDS1
// Securities [InvestiFi Securities' former name] currently limits buys and
// sells to market orders only"; members only.
//
// Fees: the page prints none of its own; InvestiFi Securities' Form CRS: "We
// do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/unitedfinancialc/unitedfinancialc_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "unitedfinancialc", {
  "https://www.unitedfinancialcu.org/invest/securities/": [
    /We have partnered with InvestiFi/i,
    /Only equity securities are offered through InvestiFi's platform/i,
    /limits buys and sells to market orders only/i,
  ],
});
