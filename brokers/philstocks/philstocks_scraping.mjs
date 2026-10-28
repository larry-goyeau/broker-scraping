// Philstocks (Philippines) sells online on one place, the Philippine
// Stock Exchange, and prints no list of its own. Its FAQ describes the
// exchange as where "the buying and selling of stocks ... from PSE Listed
// Companies take place" and prices online trades at "commission rates of
// .25% or a minimum of Php20 whichever is higher". No page leaves out a
// board, the ETF or the dollar lines, so the catalogue is every open PSE
// line, ETF and dollar lines included (they trade on the same board).
//
//   https://www.philstocks.ph/faq (fees and FAQ)
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/philstocks/philstocks_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "philstocks-parsed.json", { mic: "XPHS" });
