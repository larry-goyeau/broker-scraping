// Investors Securities (InvestaTrade, Philippines), "a proud member of
// the Philippine Stock Exchange (PSE) since 1969", sells online on that one
// place and prints no list of its own. Its home page FAQ prices buys and
// sells at "Commission fee: 0.25% based on Gross Value Traded" plus VAT,
// the SCCP and PSE fees. No page leaves out a board, the ETF or the dollar
// lines, so the catalogue is every open PSE line, ETF and dollar lines
// included (they trade on the same board).
//
//   https://www.investorsonline.ph/ (fees and FAQ)
//   https://www.investa.trade
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/investors/investors_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "investors-parsed.json", { mic: "XPHS" });
