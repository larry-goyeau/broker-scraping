// MyTrade (Philippines) sells online on one place, the Philippine Stock
// Exchange, and prints no list of its own. Its getting-started page ties
// the account to the whole exchange: once funded, "you already have access
// to all stocks listed on the Philippine Stock Exchange". So the catalogue
// is every open PSE line, ETFs included (they trade on the same board).
//
//   https://www.mytrade.com.ph/getting-started/
//   https://www.mytrade.com.ph/rates-fees/
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
//   node brokers/mytrade/mytrade_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "mytrade-parsed.json", { mic: "XPHS" });
