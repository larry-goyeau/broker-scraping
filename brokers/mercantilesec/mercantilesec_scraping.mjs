// Mercantile Securities (Philippines) sells online on one place, the
// Philippine Stock Exchange, and prints no list of its own. Its site (a
// Flutter app; the text is in main.dart.js) lists three products: Shares,
// "Trade all publicly listed companies in the Philippines"; Exchange
// Traded Funds; and Real Estate Investment Trusts. So the catalogue is
// every open PSE line, ETFs included.
//
//   https://www.mercantilesec.com/
//   https://www.mercantilesec.com/main.dart.js
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
//   node brokers/mercantilesec/mercantilesec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "mercantilesec-parsed.json", { mic: "XPHS" });
