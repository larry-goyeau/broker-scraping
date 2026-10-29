// What Zedcrest Wealth sells in its app, with no login: shares and ETFs on
// the Nigerian Exchange, its only place, executed by Zedcrest Securities.
// Its blog post announcing the service says "users can now buy and sell
// shares of more than 140 companies listed on the Nigerian Exchange (NGX)
// directly from the Zedcrest Wealth app" and "Trade stocks directly: With
// access to over 140 NGX-listed companies". No page lists them and none
// excludes a board, a segment or ETFs.
//
// A stated count with no list keeps the N most popular titles. The
// exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs through ../armsec/ngxOnline.mjs, holds
// about 134 tradable shares and 12 ETFs (closed-end funds, suspended and
// delisting lines left out): fewer than 140 shares, so "more than 140"
// takes the whole listing, ETFs included, and the run throws if that ever
// falls to 140 rows or fewer. Its mutual funds (the Zedcrest Equity Fund
// among them), treasury bills, commercial papers and bonds are not
// exchange-traded shares and are not written. Every line trades in naira.
//
// Fees: its fee explainer, "SEC regulations cap standard brokerage fees at
// a maximum of 1.35%. On platforms like Zedcrest Wealth, you can review a
// clear breakdown of your brokerage commission before confirming a trade",
// with a worked buy at "Brokerage Commission 1.0% of share value" plus NGX
// 0.3%, CSCS and VAT; the cost file takes the 1.35% cap. The run checks
// these sentences.
//
//   https://blog.zedcrestwealth.com/take-your-position-with-zedcrest-wealth/
//   https://blog.zedcrestwealth.com/stock-trading-fees-in-nigeria-brokerage-cscs-fees-hidden-charges-explained/
//
//   node brokers/zedcrest/zedcrest_scraping.mjs

import { ngxOnline } from "../armsec/ngxOnline.mjs";

await ngxOnline({
  folder: "zedcrest",
  minRows: 141,
  evidence: {
    "https://blog.zedcrestwealth.com/take-your-position-with-zedcrest-wealth/": [
      /buy and sell shares of more than 140 companies listed on the Nigerian Exchange \(NGX\) directly from the Zedcrest Wealth app/,
    ],
    "https://blog.zedcrestwealth.com/stock-trading-fees-in-nigeria-brokerage-cscs-fees-hidden-charges-explained/": [
      /SEC regulations cap standard brokerage fees at a maximum of 1\.35%\. On platforms like Zedcrest Wealth/,
      /Brokerage Commission 1\.0% of share value/,
    ],
  },
});
