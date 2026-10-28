// AB & Co. Ltd. (DSE TREC 043) sells on one place, the Dhaka Stock
// Exchange, and prints no list of its own: clients "Buy and Sell shares
// using our Mobile App, over the phone, this website or by visiting any of
// our branches", through the DSE's own apps (DSE Mobile, DSE Investor). Its
// FAQ describes the DSE's small-capital (SME) platform and names no board
// or kind of line it does not trade.
//
//   https://www.abcdsebroker.com/
//   https://www.abcdsebroker.com/faq
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
// Fees: https://www.abcdsebroker.com/fees ("Transaction Fee 0.5%")
//
//   node brokers/abcoltd/abcoltd_scraping.mjs

import { writeDseCatalogue } from "../mika/dseBook.mjs";

await writeDseCatalogue(import.meta.url, "abcoltd-parsed.json");
