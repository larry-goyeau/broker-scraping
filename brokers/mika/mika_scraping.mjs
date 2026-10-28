// Mika Securities (Dhaka, DSE TREC 215) sells through its Amar Biniyog app
// on one place, the Dhaka Stock Exchange, and prints no list of its own.
// Its pages offer the whole exchange: "Trade every asset class on the DSE",
// "Every DSE-listed equity, with market depth and instant execution",
// "Mutual funds: Open and closed-end funds", and "SME / ATB: Access SME
// board from home and trade alternative boards".
//
//   https://amarbiniyog.net/
//   https://www.mikasecurities.net/
//
// So the catalogue is every open DSE line: main-board shares, the
// closed-end mutual funds (listed and traded like shares, type FUND) and
// the SME board (open only to qualified investors under the BSEC SME rules,
// a client condition: a remark, not a removal). No ETF is listed in Dhaka
// today. The Alternative Trading Board stays out although Mika offers it:
// the DSE describes it as "unlisted and delisted securities", not listed
// lines. Treasury bonds (Mika sells them, charged 0.10%), debentures and
// sukuk are debt and stay out. Suspended, wound-up and never-traded lines
// are dropped. All in taka on XDHA.
//
// The DSE crawl is shared: ./dseBook.mjs reads the DSE company directory,
// each company page (ISIN, last session, suspension notices), the SME
// board's old site and CDBL's ISIN list, with a 12-hour cache in
// dse-cache.json.
//
// Fees: https://www.mikasecurities.net/pricing/ (0.50% standard commission)
//
//   node brokers/mika/mika_scraping.mjs

import { writeDseCatalogue } from "./dseBook.mjs";

await writeDseCatalogue(import.meta.url, "mika-parsed.json");
