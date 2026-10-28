// Mondol Securities (DSE TREC 209) sells on one place, the Dhaka Stock
// Exchange, and prints no list of its own. It provides "the brokerage
// services under the TREC of Dhaka Stock Exchange Limited (DSE)" and
// offers "THE EASIEST WAY TO TRADE SHARES ONLINE IN THE DHAKA STOCK
// EXCHANGE" through the DSE Mobile app, with no board or kind of line left
// out.
//
//   https://www.mondolsecurities.com/
//
// So the catalogue is every open DSE line: main-board shares, the
// closed-end mutual funds (listed and traded like shares, type FUND) and
// the SME board (open only to qualified investors under the BSEC SME rules,
// a client condition: a remark, not a removal). No ETF is listed in Dhaka
// today. The Alternative Trading Board ("unlisted and delisted
// securities"), treasury bonds, debentures and sukuk stay out, as do
// suspended, wound-up and never-traded lines. All in taka on XDHA.
//
// The DSE crawl is shared: ../mika/dseBook.mjs reads the DSE company
// directory, each company page (ISIN, last session, suspension notices),
// the SME board's old site and CDBL's ISIN list, with a 12-hour cache.
//
// Fees: https://www.mondolsecurities.com/#charges ("Buy Shares: 0.45%",
// "Sell Shares: 0.45%")
//
//   node brokers/mondol/mondol_scraping.mjs

import { writeDseCatalogue } from "../mika/dseBook.mjs";

await writeDseCatalogue(import.meta.url, "mondol-parsed.json");
