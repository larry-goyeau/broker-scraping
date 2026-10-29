// What ARM Securities sells through ARM Stocktrade (web and app), with no
// login: every share and ETF on the Nigerian Exchange, its only place. Its
// securities page says "Trade stocks online from anywhere, at anytime" and
// "Trade stocks and approved securities seamlessly using our secure online
// trading platform"; the Stocktrade FAQ says "To trade, you only need a
// smartphone or an internet enabled web browser". No page excludes a
// board, a segment or ETFs, and none names a list of its own, so the book
// is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs through ./ngxOnline.mjs (shares, listed
// REITs and ETFs; closed-end funds, suspended and delisting lines left
// out). The Stocktrade page's "Discover stocks on the NSE and all over the
// world" names no foreign market and no page offers one; the treasury
// bills and FGN savings bonds on the securities page are not shares.
// Every line trades in naira.
//
// Fees: the Stocktrade FAQ, "ARM STOCKTRADE' brokerage fee is a flat rate
// of 1% on transactions executed", plus the statutory SEC, CSCS, NSE and
// stamp-duty charges it tabulates. The run checks these sentences.
//
//   https://www.arm.com.ng/securities/
//   https://www.arm.com.ng/securities-old/faq-2/
//
//   node brokers/armsec/armsec_scraping.mjs

import { ngxOnline } from "./ngxOnline.mjs";

await ngxOnline({
  folder: "armsec",
  evidence: {
    "https://www.arm.com.ng/securities/": [
      /Trade stocks online from anywhere, at anytime/,
      /Trade stocks and approved securities seamlessly using our secure online trading platform/,
    ],
    "https://www.arm.com.ng/securities-old/faq-2/": [
      /To trade, you only need a smartphone or an internet enabled web browser/,
      /brokerage fee is a flat rate of 1% on transactions executed/,
    ],
  },
});
