// What CS Wealth Securities (中策富滙證券, Hong Kong) sells in shares and
// ETFs, with no login: Hong Kong and US stocks, in its app. The home page:
// "港股 / 美股 ... 提供香港及美國市場之證券交易服務"; the app user guide's
// Market tab shows "Hong Kong Stocks" and "US Stocks". It publishes no list
// of titles.
//
// Fees (Service Fees and Transaction Charges, effective 15/9/2026): Hong
// Kong "APP dealing: 0.08% of transaction amount, minimum HK$ 50"; US
// "APP dealing: higher of 0.08% of transaction amount or US$0.01 per share,
// minimum US$ 10". The same schedule prices "Over-the-counter Products"
// (global equities, ETFs, bonds, options) by capped rate only, dealt
// through the firm, not in the app; they are not in this catalogue.
//
// No page names a board, a US exchange or a kind of share or fund that is
// not traded, so (owner rule: the whole place unless the broker names an
// exception) Hong Kong is HKEX's whole book of shares, REITs and ETPs
// (../primehk/hkexBook.mjs; HKD, USD and RMB counters as their own codes)
// and the US is the whole exchange book of the day
// (../wellstrade/usBook.mjs, one NBBO row per title, no OTC lines).
// broker-list.json names the same two places.
//
// Client-dependent, so not a removal: HKEX's leveraged and inverse
// products need an SFC derivatives-knowledge assessment.
//
//   https://www.cswsec.com.hk/
//   https://www.cswsec.com.hk/wp-content/uploads/2026/06/APP-user-guide.pdf
//
// Fees: https://www.cswsec.com.hk/wp-content/uploads/2026/09/Service-Fee服務收費-Revised-Sep-2026.pdf
//
//   node brokers/cswealth/cswealth_scraping.mjs

import { evidence, hkCatalogue } from "../bocomhk/hkCatalogue.mjs";

await evidence("https://www.cswsec.com.hk/", [/港股 \/ 美股/, /提供香港及美國市場之證券交易服務/]);

await hkCatalogue({
  folder: "cswealth",
  us: { mics: null },
  least: { HKEX: 2500, US: 10000 },
});
