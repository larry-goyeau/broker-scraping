// What Yugen Bertumbuh Sekuritas sells through Yugen Online Trading, with
// no login: every share and ETF of the Indonesia Stock Exchange, its only
// place (the broker-list row names IDX alone). Its product summary
// (RIPLAY) describes the brokerage service as the purchase or sale of
// securities "melalui Bursa Efek Indonesia (BEI) ... yang dilakukan oleh
// Nasabah secara langsung melalui aplikasi Yugen Online Trading atau
// layanan Sales YBS", and says "Nasabah dapat melakukan pembelian dan
// penjualan saham secara online". No Yugen page names a list of its own, a
// board it refuses or an excluded share, so the book is the exchange's
// whole listing less the lines that cannot trade (suspended, delisted,
// not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs trade in the same book and nothing leaves
// them out, so they stay; the Watchlist board stays. Everything trades in
// rupiah.
//
//   https://www.yugen.co.id/documents/files/docs/YBS%20RIPLAY.pdf
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the RIPLAY ("Online Trading Beli: 0.15% Jual: 0.25%"; through
// sales 0.25% / 0.35%). The run checks it before writing.
//
//   node brokers/yugen/yugen_scraping.mjs

import { pdfSays } from "../bcasekuritas/pdfSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

await pdfSays("https://www.yugen.co.id/documents/files/docs/YBS%20RIPLAY.pdf", [
  /Online Trading Beli: 0\.15% Jual: 0\.25%/i,
  /melalui aplikasi Yugen Online Trading/i,
  /pembelian dan penjualan saham secara online/i,
]);

await writeIdxCatalogue(import.meta.url, "yugen-parsed.json");
