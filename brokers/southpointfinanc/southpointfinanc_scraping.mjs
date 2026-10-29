// What SouthPoint Financial Credit Union (Minnesota) sells in shares and
// exchange-traded funds, with no login. Its online investing is InvestiFi's
// portal inside its digital banking (broker InvestiFi Securities LLC,
// custodian RQD Clearing LLC): "Invest directly in securities and
// cryptocurrency through the InvestiFi platform in SouthPoint's Online &
// Mobile Banking" and "With SouthPoint's Digital Investing Portal, you can
// buy, sell, and hold stocks and ETFs". It names no list and no exception of
// its own.
//
//   https://www.southpointfinancial.com/digital-investing/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): members
// over 18 in good standing; US residents only.
//
// Fees: the page prints none of its own (brokerage "provided by InvestiFi
// Securities LLC"); InvestiFi Securities' Form CRS: "We do not charge
// commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/southpointfinanc/southpointfinanc_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "southpointfinanc", {
  "https://www.southpointfinancial.com/digital-investing/": [
    /through the InvestiFi platform in SouthPoint's Online & Mobile Banking/i,
    /buy, sell, and hold stocks and ETFs/i,
    /Brokerage services are provided by InvestiFi Securities LLC/i,
  ],
});
