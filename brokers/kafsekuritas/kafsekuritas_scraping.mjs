// What KAF Sekuritas Indonesia sells online through KAF ETRADE, with no
// login: every share and ETF of the Indonesia Stock Exchange, its only
// place (the broker-list row names IDX alone). Its FAQ says "KAF Sekuritas
// menyediakan layanan investasi saham dan turunannya (waran, HMETD, ETF),
// secara online maupun reguler", ordered through "online trading system
// KAF ETRADE (aplikasi mobile Neo BOFIS atau website kaf.bofis.id)". No
// KAF page names a list of its own, a board it refuses or an excluded
// share, so the book is the exchange's whole listing less the lines that
// cannot trade (suspended, delisted, not yet listed, no trade in 20
// sessions), read by ../stockbit/idxBook.mjs. ETFs are named and stay; the
// Watchlist board stays. Warrants and rights (HMETD) are not shares and
// are not in the book. Everything trades in rupiah.
//
//   https://www.kafsekuritas.co.id/id/faqs
//   https://www.kafsekuritas.co.id/id/post/fee-saham-promoktober
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the October 2025 promotion page, after its promo ended on 30
// December 2025 ("Fee transaksi beli akan kembali normal menjadi 0,15% usai
// periode promo berakhir. Fee transaksi jual ... dikenakan tambahan PPN
// 0,1% dari fee transaksi beli", so 0,25% to sell). The run checks both
// pages before writing.
//
//   node brokers/kafsekuritas/kafsekuritas_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

await pageSays("https://www.kafsekuritas.co.id/id/faqs", [
  /layanan investasi saham dan turunannya \(waran, HMETD, ETF\), secara online maupun reguler/i,
  /online trading system KAF ETRADE/i,
]);
await pageSays("https://www.kafsekuritas.co.id/id/post/fee-saham-promoktober", [
  /Fee transaksi beli akan kembali normal menjadi 0,15% usai periode promo berakhir/i,
  /Fee transaksi jual \(sebelum dan setelah periode promo\) dikenakan tambahan PPN 0,1% dari fee transaksi beli/i,
]);

await writeIdxCatalogue(import.meta.url, "kafsekuritas-parsed.json");
