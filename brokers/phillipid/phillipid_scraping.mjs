// What Phillip Sekuritas Indonesia sells through POEMS, with no login:
// every share and ETF of the Indonesia Stock Exchange, its only place (the
// broker-list row names IDX alone; the foreign markets of the Phillip
// group are sold by other Phillip entities). Its knowledge base says POEMS
// lets the client "melakukan sendiri transaksi beli atau jual saham, reksa
// dana, SBN Ritel, dan ETF secara aman, real time". No POEMS page names a
// list of its own, a board it refuses or an excluded share, so the book is
// the exchange's whole listing less the lines that cannot trade
// (suspended, delisted, not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs are named and stay; the Watchlist board
// stays. Mutual funds and retail government bonds are not exchange-traded
// shares and are not in the book. Everything trades in rupiah.
//
//   https://www.poems.co.id/Support/Knowledgebase
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the same page ("Komisi atau Fee - Tabel Fee Transaksi": Online
// Beli 0.15%, Jual 0.25%; Non Online 0.2% / 0.3%). The run checks both
// sentences before writing.
//
//   node brokers/phillipid/phillipid_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

// The page writes the percent sign as "&#37;".
await pageSays("https://www.poems.co.id/Support/Knowledgebase", [
  /Tabel Fee Transaksi Action Online Non Online Beli 0\.15(?:%|&#37;) 0\.2(?:%|&#37;) Jual 0\.25(?:%|&#37;) 0\.3(?:%|&#37;)/i,
  /transaksi beli atau jual saham, reksa dana, SBN Ritel, dan ETF/i,
]);

await writeIdxCatalogue(import.meta.url, "phillipid-parsed.json");
