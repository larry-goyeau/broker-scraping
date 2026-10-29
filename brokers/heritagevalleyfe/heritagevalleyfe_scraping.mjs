// What Heritage Valley Federal Credit Union (York, Pennsylvania) sells in
// shares and exchange-traded funds, with no login. Its online investing is
// InvestiFi's portal inside its digital banking (broker InvestiFi Securities
// LLC, custodian RQD Clearing LLC): "buy and sell over 6,500 stocks and
// exchange-traded funds (ETFs)" in its Personal Investment Portal, powered by
// InvestiFi. It names no list and no exception of its own.
//
//   https://heritagevalleyfcu.org/digitalinvesting/
//
// The catalogue is InvestiFi's book (../rivervalleycredi/investifiBook.mjs,
// whose header quotes its sources): the 6,500 most popular US exchange-listed
// shares and ETFs (the platform's stated size), ETNs and OTC lines out. One
// row per title on its primary listing, in dollars.
//
// Remarks, not removals (they depend on the client or the order): "Since all
// trades are market orders, they typically cannot be canceled"; market hours
// only; minimum buy $1.00, minimum sell $1.10.
//
// Fees: the page prints none of its own; InvestiFi Securities' Form CRS: "We
// do not charge commissions on trades".
//   https://files.brokercheck.finra.org/crs_289604.pdf
//
//   node brokers/heritagevalleyfe/heritagevalleyfe_scraping.mjs

import { writeCreditUnion } from "../rivervalleycredi/investifiBook.mjs";

await writeCreditUnion(import.meta.url, "heritagevalleyfe", {
  "https://heritagevalleyfcu.org/digitalinvesting/": [
    /buy and sell over 6,500 stocks and exchange-traded funds/i,
    /Since all trades are market orders/i,
    /InvestiFi/,
  ],
});
