// Stratiphy (UK) sells UK-listed shares and exchange-traded products, in a
// general account, an ISA and an IFISA, held by WealthKernel ("WealthKernel
// is our custodian and partner for brokerage services"). Its FAQ says
// "Currently, Stratiphy offers UK stocks and ETFs", and its pricing table
// prices "Stocks" and "ETPs" ("ETF, ETC, ETN"); the FAQ also offers the
// 21shares crypto ETNs listed on the London Stock Exchange. Stratiphy prints
// no list of its own, and no page leaves out a market (AIM), the
// depositary-receipt lines or the dollar lines, so the catalogue is every
// open line of the London Stock Exchange: shares, ETFs, ETNs and ETCs, each
// in its own trading currency.
//
//   https://www.stratiphy.io/faq ("Which markets does Stratiphy cover?")
//   https://www.stratiphy.io/pricing (fees: no charge for trades inside a
//     strategy; self-directed trades £2 for stocks and £4 for ETPs, orders
//     limited to £10k)
//
// Left out (in the shared crawl): suspended or halted lines, trade-reporting
// lines with no order book, rights and other corporate-action lines, lines
// not trading yet; bonds, warrants and other securitised derivatives are
// never read. The LSE crawl is shared: ./lseBook.mjs reads the LSE price
// explorer data API.
//
//   https://www.londonstockexchange.com/en/price-explorer
//
//   node brokers/stratiphy/stratiphy_scraping.mjs

import { writeLseCatalogue } from "./lseBook.mjs";

await writeLseCatalogue(import.meta.url, "stratiphy-parsed.json");
