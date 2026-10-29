// What Profindo Sekuritas Indonesia sells online through ProClick, with no
// login: every share and ETF of the Indonesia Stock Exchange, its only
// place (the broker-list row names IDX alone). Its home page invites
// clients to "trade with our user friendly online trading platform
// ProClick" and offers "Equity Brokerage". No Profindo page names a list of
// its own, a board it refuses or an excluded share, so the book is the
// exchange's whole listing less the lines that cannot trade (suspended,
// delisted, not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs trade in the same book and nothing leaves
// them out, so they stay; the Watchlist board stays. Everything trades in
// rupiah. (proclick.profindo.com, the platform's own site, does not answer
// from outside Indonesia; the profindo.com pages below do.)
//
//   https://profindo.com/
//   https://profindo.com/page/tutorial-opening-account
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the opening-account page ("Untuk Nasabah Online Fee beli 0.18% dan
// Fee Jual 0.28%."). The run checks both pages before writing.
//
//   node brokers/profindo/profindo_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

await pageSays("https://profindo.com/", [/trade with our user friendly online trading platform/i, /Equity Brokerage/i]);
await pageSays("https://profindo.com/page/tutorial-opening-account", [/Untuk Nasabah Online Fee beli 0\.18% dan Fee Jual 0\.28%/i]);

await writeIdxCatalogue(import.meta.url, "profindo-parsed.json");
