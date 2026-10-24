// Landbank Securities (Philippines) sells online through MyStocks on one
// place, the Philippine Stock Exchange, and prints no list of its own. The
// MyStocks FAQ ties the account to the whole exchange: "With MyStocks, you
// can trade the stocks listed at the Philippine Stock Exchange." So the
// catalogue is every open PSE line, ETFs included (they trade on the same
// board).
//
//   https://www.landbanksec.com/login/includes/faqs.asp
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/form.do
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/landbanksec/landbanksec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "landbanksec-parsed.json", { mic: "XPHS" });
