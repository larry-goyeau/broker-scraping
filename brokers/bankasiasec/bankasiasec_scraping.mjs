// Bank Asia Securities (BASL, a subsidiary of Bank Asia) sells on one
// place, the Dhaka Stock Exchange, and prints no list of its own. It
// "is currently providing the brokerage services under the membership of
// Dhaka Stock Exchange Limited (DSE)", and offers "secondary market
// trading, initial public offering, or block trading" with no exclusion of
// a board or a kind of line (it also publishes a weekly mutual fund
// review). Orders go through the DSE's own trading apps (DSE Mobile, DSE
// Investor).
//
//   https://www.basl-bd.com/home/about
//   https://www.basl-bd.com/home/bservices
//   https://www.basl-bd.com/downloads/User_Guide_DSE_Investor_v1.0.pdf
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
// Fees: https://www.basl-bd.com/home/commissionrate ("Absolute Cash
// Account ... brokerage commission @0.30%")
//
//   node brokers/bankasiasec/bankasiasec_scraping.mjs

import { writeDseCatalogue } from "../mika/dseBook.mjs";

await writeDseCatalogue(import.meta.url, "bankasiasec-parsed.json");
