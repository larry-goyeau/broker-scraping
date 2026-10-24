// BDO Securities (the stockbroker of BDO Unibank, Philippines) sells online
// on one place, the Philippine Stock Exchange, and prints no list of its
// own. Its FAQ says the app lets a client "Buy | Sell | Monitor listed
// company stocks on the Philippine Stock Exchange"; REITs "trade on the
// Philippine Stock Exchange (PSE) and you can purchase REITs through your
// BDO Securities account" once a Name-on-Central-Depository account is
// open, and the same account serves "Dollar Denominated Securities (DDS)".
// So the catalogue is every open PSE line, the dollar lines and the ETF
// included (they trade on the same board; no page excludes them).
//
//   https://www.bdo.com.ph/securities/frequently-asked-questions
//   https://www.bdo.com.ph/bdo-securities/online-trading
//   https://www.bdo.com.ph/securities/fees
//
// bdo.com.ph sits behind Akamai and hangs for scripts, so the pages are
// not checked at run time. The sentences above were read on the Wayback
// Machine copies of 2 December 2025 (FAQ) and 13 April 2026 (online
// trading).
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/bdosec/bdosec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "bdosec-parsed.json", { mic: "XPHS" });
