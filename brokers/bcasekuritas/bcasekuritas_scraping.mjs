// What BCA Sekuritas sells online, with no login: every share and ETF of
// the Indonesia Stock Exchange, its only place (the broker-list row names
// IDX alone). Its product summary (RIPLAY) describes the brokerage service
// as the purchase or sale of securities "melalui Bursa Efek Indonesia (BEI)
// ... yang dilakukan oleh Nasabah secara langsung melalui aplikasi Online
// Trading BCAS" or through its sales desk, and its equity page lists
// "perdagangan saham, rights, waran, ETF, dan instrumen ekuitas lainnya".
// No BCA Sekuritas page names a list of its own, a board it refuses or an
// excluded share, so the book is the exchange's whole listing less the
// lines that cannot trade (suspended, delisted, not yet listed, no trade
// in 20 sessions), read by ../stockbit/idxBook.mjs. ETFs stay (the equity
// page names them); the Watchlist board stays. Rights and warrants are not
// shares and are not in the book; over-the-counter deals and IPO orders
// are not exchange listings. Everything trades in rupiah.
//
//   https://bcasekuritas.co.id/our-service/equity
//   https://bcasekuritas.co.id/help/download
//   https://bcasekuritas.co.id/api/pdf/RIPLAY%20Umum_versi%2020082025.pdf
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the RIPLAY ("Online Trading Beli/Buy : 0,1815% Jual/Sell :
// 0,2815%"; through sales 0,2522% / 0,3522%). The run checks the RIPLAY
// and the equity page before writing.
//
//   node brokers/bcasekuritas/bcasekuritas_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { pdfSays } from "./pdfSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const RIPLAY = "https://bcasekuritas.co.id/api/pdf/RIPLAY%20Umum_versi%2020082025.pdf";

await pageSays("https://bcasekuritas.co.id/our-service/equity", [/perdagangan saham , rights , waran , ETF/i]);
await pdfSays(RIPLAY, [
  /Online Trading Beli\s*\/\s*Buy\s*:\s*0,1815%\s*Jual\s*\/\s*Sell\s*:\s*0,2815%/i,
  /melalui aplikasi Online Trading BCAS/i,
]);

await writeIdxCatalogue(import.meta.url, "bcasekuritas-parsed.json");
