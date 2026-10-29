// What Zion Stockbrokers & Securities sells online, with no login: every
// share and ETF on the Nigerian Exchange, its only place. Its site's
// client area offers "Process/View orders. Buy and sell stocks online
// without stress." and its FAQ prices "doing trades through Zion
// Stockbrokers Ltd on the stock exchange". No page excludes a board, a
// segment or ETFs, and none names a list of its own, so the book is the
// exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs through ../armsec/ngxOnline.mjs (shares,
// listed REITs and ETFs; closed-end funds, suspended and delisting lines
// left out). Every line trades in naira.
//
// Fees: the FAQ, "Our total charge for buying is 1.35% and selling is
// 1.35% of the value of the transaction." The run checks these sentences.
//
//   https://www.zionstockbrokers.com/faq.php
//
//   node brokers/zionstock/zionstock_scraping.mjs

import { ngxOnline } from "../armsec/ngxOnline.mjs";

await ngxOnline({
  folder: "zionstock",
  evidence: {
    "https://www.zionstockbrokers.com/faq.php": [
      /Buy and sell stocks online without stress/,
      /Our total charge for buying is 1\.35% and selling is 1\.35% of the value of the transaction/,
    ],
  },
});
