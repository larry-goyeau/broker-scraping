// What Lotus Andalan Sekuritas sells online through LOTS, with no login:
// every share and ETF of the Indonesia Stock Exchange, its only place (the
// broker-list row names IDX alone). Its online-trading page introduces
// "LOTS, your gateway to seamless online trading" and names no list of its
// own, no board it refuses and no excluded share, so the book is the
// exchange's whole listing less the lines that cannot trade (suspended,
// delisted, not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs trade in the same book and nothing leaves
// them out, so they stay; the Watchlist board stays. Everything trades in
// rupiah.
//
//   https://lotussekuritas.com/services/securities/trading
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the same page ("Komisi transaksi beli 0,15% dan komisi transaksi
// jual 0,25%."). The run checks both sentences before writing.
//
//   node brokers/lotusandalan/lotusandalan_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

await pageSays("https://lotussekuritas.com/services/securities/trading", [
  /Introducing LOTS, your gateway to seamless online trading/i,
  /Komisi transaksi beli 0,15% dan komisi transaksi jual 0,25%/i,
]);

await writeIdxCatalogue(import.meta.url, "lotusandalan-parsed.json");
