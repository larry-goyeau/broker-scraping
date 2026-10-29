// What Investment One Stockbrokers International sells through EasyInvest,
// its trading app, with no login: every share and ETF on the Nigerian
// Exchange, its only place. Its stockbroking site lists "EASYINVEST
// Explore the equities market and trade on the go" among its products, and
// the firm is "a dealing member of the Nigeria Stock Exchange". Its risk
// disclosure statement covers shares and has a section "Risks Associated
// with Exchange Traded Funds (ETFs)". No page excludes a board, a segment
// or ETFs, and none names a list of its own, so the book is the exchange's
// whole listing of the day, read by ../morgancapital/ngxWhole.mjs through
// ../armsec/ngxOnline.mjs (shares, listed REITs and ETFs; closed-end funds,
// suspended and delisting lines left out). Its bonds, treasury bills,
// margin loans and the broker-to-bank channel are not online shares and
// are not written. Every line trades in naira.
//
// Fees: the risk disclosure statement's table, "OTHERS: BROKERAGE
// COMMISSION 1.35% 1.35%" (buy and sell), with NGX 0.3%, CSCS 0.3%, SEC
// 0.3%, stamp duty 0.08%, a N6 trade alert and VAT. The run checks these
// sentences.
//
//   https://stockbrokers.investment-one.com/
//   https://www.investment-one.com/risk-disclosure-statement/
//
//   node brokers/investmentone/investmentone_scraping.mjs

import { ngxOnline } from "../armsec/ngxOnline.mjs";

await ngxOnline({
  folder: "investmentone",
  evidence: {
    "https://stockbrokers.investment-one.com/": [/EASYINVEST Explore the equities market and trade on the go/],
    "https://www.investment-one.com/risk-disclosure-statement/": [
      /BROKERAGE COMMISSION 1\.35% 1\.35%/,
      /Risks Associated with Exchange Traded Funds \(ETFs\)/,
    ],
  },
});
