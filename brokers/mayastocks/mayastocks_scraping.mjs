// Maya Stocks (Philippines) is the stock tab of the Maya wallet app. Orders
// go through a partner broker licensed by the SEC (Philstocks today, with
// 2TradeAsia and DragonFi shown as partners), on one place: the Philippine
// Stock Exchange. Its page says Maya Stocks "lets you trade stocks or shares
// of companies listed in the Philippine Stock Exchange", and prints no list
// of its own. The marketing line "over 280 of the top companies" is a count,
// not a selection, and no board, segment or ETF is excluded. So the
// catalogue is every open PSE line, ETFs included (they trade on the same
// board). The support article on buying stocks only renders with JavaScript
// and adds nothing that can be read.
//
//   https://www.maya.ph/stocks
//   https://support.maya.ph/s/article/How-do-I-buy-stocks-in-Yapster
//
// Fees (same page, FAQ "Are there are any fees when using Maya Stocks?"):
// broker commission "0.25% or P20, whichever is higher", VAT 12% on the
// commission, PSE fee, PCD fee, 0.6% sales tax on sells, and Philstocks
// platform fees (1% of deposit, P25 per withdrawal).
//
//   https://www.maya.ph/stocks
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
//   node brokers/mayastocks/mayastocks_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "mayastocks-parsed.json", { mic: "XPHS" });
