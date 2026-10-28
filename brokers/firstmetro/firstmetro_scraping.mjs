// First Metro Securities (FirstMetroSec, Metrobank group, Philippines)
// sells online on one place, the Philippine Stock Exchange, and prints no
// list of its own. Its help centre prices "Online Trading 0.25% of the
// gross value" for stocks in both a peso and a dollar account, and its
// dollar account serves "stocks or securities listed, traded, and settled
// in US Dollar denomination" on the PSE; REITs trade "like common stocks
// ... using the FirstMetroSec trading platform". No page leaves out a
// board, the ETF or the dollar lines, so the catalogue is every open PSE
// line, the ETF (AETF, the former FMETF) and the dollar lines included.
// Bonds (PDEx), mutual funds and UITFs (FundsMart) are not this market.
//
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429528585369-Fees-and-Charges
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429167151129-Dollar-Denominated-Securities-DDS
//   https://help.firstmetrosec.com.ph/hc/en-us/articles/55429068998553-Real-Estate-Investment-Trust-REITs
//
// The help centre sits behind a Cloudflare check; the articles were read
// through its public Zendesk API
// (https://help.firstmetrosec.com.ph/api/v2/help_center/en-us/articles/<id>.json).
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/firstmetro/firstmetro_scraping.mjs

import { writePseCatalogue } from "../col/pseBook.mjs";

await writePseCatalogue(import.meta.url, "firstmetro-parsed.json", { mic: "XPHS" });
