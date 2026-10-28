// Luna Securities (Philippines), "a member-broker of the Philippine Stock
// Exchange", sells through its mobile app on that one place and prints no
// list of its own. The app gives "real-time connections for traders and
// investors of Philippine stocks"; its support page prices trades on a
// sliding scale (Php 5.00 up to Php 2,500, then 0.20% down to 0.12% above
// Php 1m). No page leaves out a board, the ETF or the dollar lines, so the
// catalogue is every open PSE line, ETF and dollar lines included (they
// trade on the same board).
//
//   https://www.lunasecurities.com/support/ (fees; the answers sit in the
//     page script /_next/static/chunks/app/support/page-*.js)
//   https://play.google.com/store/apps/details?id=com.iq.luna&hl=en_US
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/lunasec/lunasec_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "lunasec-parsed.json", { mic: "XPHS" });
