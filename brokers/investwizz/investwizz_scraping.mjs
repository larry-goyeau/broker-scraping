// Investwizz (UK) is an execution-only app selling a Stocks & Shares ISA,
// with orders sent to WealthKernel and "executed by WealthKernel once a day
// in a batch". Its terms describe the Core plan as "investing in any of the
// shares, ETFs and ETCs available in the App", and its FAQ explains ETFs
// and ETCs only. So the catalogue keeps shares, ETFs and ETCs and leaves out
// the exchange-traded notes (ETNs), which no Investwizz page offers.
// Investwizz prints no list of its own and no page leaves out a market
// (AIM), the depositary-receipt lines or the dollar lines ("if you buy or
// sell an investment priced in a currency other than Sterling, WealthKernel
// Limited converts the currency"), so every other open line of the London
// Stock Exchange is kept, each in its own trading currency.
//
//   https://www.investwizz.co.uk/terms-of-service (clauses 2.1, 6.1, 7.2, 7.5)
//   https://www.investwizz.co.uk/faqs
//   https://www.investwizz.co.uk/pricing (fees: £9.99 a month on the Core
//     plan, "no dealing charges, custody fees or FX conversion fees")
//
// Left out (in the shared crawl): suspended or halted lines, trade-reporting
// lines with no order book, rights and other corporate-action lines, lines
// not trading yet; bonds, warrants and other securitised derivatives are
// never read. The LSE crawl is shared: ../stratiphy/lseBook.mjs reads the
// LSE price explorer data API.
//
//   https://www.londonstockexchange.com/en/price-explorer
//
//   node brokers/investwizz/investwizz_scraping.mjs

import { writeLseCatalogue } from "../stratiphy/lseBook.mjs";

await writeLseCatalogue(import.meta.url, "investwizz-parsed.json", { types: ["STOCK", "ETF", "ETC"] });
