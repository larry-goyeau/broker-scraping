// 2TradeAsia (F. Yap Securities, Philippines) sells online on one place,
// the Philippine Stock Exchange, and prints no list of its own. Its FAQ
// ties the account to the whole exchange: "You can trade any stocks listed
// in the Philippine Stocks Exchange", with a link to the PSE listed-company
// directory. So the catalogue is every open PSE line, ETFs included (they
// trade on the same board).
//
//   https://www.2tradeasia.com/faqs
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
//   node brokers/2tradeasia/2tradeasia_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "2tradeasia-parsed.json", { mic: "XPHS" });
