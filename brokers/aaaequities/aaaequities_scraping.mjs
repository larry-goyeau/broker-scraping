// AAA Southeast Equities (AAA Equities, Philippines), "a stock brokerage
// and member of the Philippine Stock Exchange", sells online on that one
// place and prints no list of its own. Its FAQ prices online trades at a
// 0.25% commission plus VAT, the PSE and SCCP fees and the 0.1% sales tax,
// and its orders are sent "to the exchange" (the PSE). No page leaves out a
// board, the ETF or the dollar lines, so the catalogue is every open PSE
// line, ETF and dollar lines included (they trade on the same board).
//
//   https://aaa-equities.com.ph/faq/ (fees and FAQ)
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/aaaequities/aaaequities_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "aaaequities-parsed.json", { mic: "XPHS" });
