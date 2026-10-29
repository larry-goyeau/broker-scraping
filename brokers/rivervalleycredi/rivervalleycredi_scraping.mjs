// What River Valley Credit Union (Ohio) sells in shares and exchange-traded
// funds, with no login. Its self-directed page offers InvestiFi's portal
// inside online banking: "With the new self-directed investment portal,
// provided by InvestiFi, you can buy and sell stocks on your own", "What
// types of investments can I make? You can invest in a variety of
// securities including: Stocks Exchange-Traded Funds (ETFs)", and "All
// securities and brokerage services are offered by InvestiFi Securities,
// member FINRA/SIPC". It names no list and no exception of its own.
//
//   https://www.rivervalleycu.org/self-directed-investments
//
// The catalogue is InvestiFi's book (./investifiBook.mjs, whose header
// quotes its sources): the 6,500 most popular US exchange-listed shares
// and ETFs (the platform's stated size), ETNs and OTC lines out. One row
// per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client): "Available for
// Personal Accounts 18 and over"; US residents only; access through River
// Valley online banking.
//
// Fees: the page prints none of its own and points to InvestiFi's terms
// ("Please visit [InvestiFi.co/legal] for applicable terms"); InvestiFi
// Securities' Form CRS: "We do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/rivervalleycredi/rivervalleycredi_scraping.mjs

import { writeCreditUnion } from "./investifiBook.mjs";

await writeCreditUnion(import.meta.url, "rivervalleycredi", {
  "https://www.rivervalleycu.org/self-directed-investments": [
    /self-directed investment portal, provided by InvestiFi/i,
    /You can invest in a variety of securities including: Stocks Exchange-Traded Funds/i,
    /All securities and brokerage services are offered by InvestiFi Securities/i,
  ],
});
