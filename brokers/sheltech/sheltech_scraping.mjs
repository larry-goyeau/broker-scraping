// Sheltech Brokerage (Sheltech group) sells on one place, the Dhaka Stock
// Exchange, and prints no list of its own. It calls itself "a leading
// full-service broker in Dhaka Stock Exchange", offers a "cash account,
// margin account, IPO account or a Mutual Fund investment account", and
// names no board or kind of line it does not trade.
//
//   https://www.sheltechbrokerage.com/about
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
// Fees: https://www.sheltechbrokerage.com/page/details/fees-charges
// ("The commission is agreed at maximum 1% of trade value")
//
//   node brokers/sheltech/sheltech_scraping.mjs

import { writeDseCatalogue } from "../mika/dseBook.mjs";

await writeDseCatalogue(import.meta.url, "sheltech-parsed.json");
