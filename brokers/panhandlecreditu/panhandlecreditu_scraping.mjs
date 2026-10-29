// What Panhandle Credit Union (Panama City, Florida) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "Members can buy and sell stocks and ETFs
// without downloading extra apps" (PCU + InvestiFi), and on its Securities &
// ETFs page "Only equity securities are offered through InvestiFi's
// platform". It names no list and no exception of its own.
//
//   https://www.panhandlecu.org/products/digital-investments
//   https://www.panhandlecu.org/products/securities-etfs
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): members 18
// and over; "commercial accounts aren't supported"; "account holders who
// reside in Texas, Idaho, or New York aren't eligible to trade" (FAQ page; a
// client rule, not a title rule).
//
// Fees: "PCU members age 18 and older can enjoy this service for free, with
// no enrollment or monthly fees through December 2026. The Fee will be $3 per
// month, beginning January 1, 2027" (same page); no commission is printed;
// InvestiFi Securities' Form CRS: "We do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/panhandlecreditu/panhandlecreditu_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "panhandlecreditu", {
  "https://www.panhandlecu.org/products/digital-investments": [
    /Members can buy and sell stocks and ETFs without downloading extra apps/i,
    /InvestiFi/,
    /free, with no enrollment or monthly fees through December 2026/i,
    /\$3 per month, beginning January 1, 2027/i,
  ],
  "https://www.panhandlecu.org/products/securities-etfs": [
    /Only equity securities are offered through InvestiFi's platform/i,
  ],
});
