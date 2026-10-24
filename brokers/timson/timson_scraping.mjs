// Timson Securities (Timson Trade, Philippines) sells online on one place,
// the Philippine Stock Exchange, and prints no list of its own. Its FAQ
// ties the account to the whole exchange: "You can trade all non-suspended
// stocks and real estate investment trusts (REITs) that are publicly listed
// in the Philippine Stock Exchange (PSE)." The site never names an ETF (no
// match for ETF or "exchange traded" in its 53 FAQ entries, its pages or
// its account form), so the PSE's ETF line stays out: the catalogue is the
// open PSE shares, REITs included.
//
//   https://www.timson.com.ph/faq/what-types-of-securities-can-i-trade-using-timson-trade/
//   https://www.timson.com.ph/faq/what-are-the-fees-when-buying-and-selling-stocks/
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
//   node brokers/timson/timson_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "timson-parsed.json", { types: ["STOCK"], mic: "XPHS" });
