// COL Financial sells online every non-suspended security listed on
// the Philippine Stock Exchange. There is no COL list. The PSE stock
// page names each line and says whether it is Open or Suspended. A
// suspended line stays out. TradingView supplies the description, the
// currency and the ETF mark.
//
// A warrant and a right stay out. A pre-IPO stays out. A bond stays
// out. The mutual-fund supermarket is not this market.
//
// The PSE crawl lives in ./pseBook.mjs, shared with the other brokers
// that sell the whole PSE list.
//
//   https://colfinancial.freshdesk.com/support/solutions/articles/6000054496-what-types-of-securities-can-i-trade-through-colfinancial-
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//   https://symbol-search.tradingview.com/symbol_search/v3/?text=SM&exchange=PSE&lang=en&domain=production&search_type=stocks
//
//   node brokers/col/col_scraping.mjs

import { writePseCatalogue } from "./pseBook.mjs";

await writePseCatalogue(import.meta.url, "col-parsed.json");
