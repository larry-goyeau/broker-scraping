// What MNC Sekuritas sells online through MotionTrade, with no login:
// every share and ETF of the Indonesia Stock Exchange, its only place (the
// broker-list row names IDX alone). Its equity page offers "Pembukaan
// rekening efek konvensional dan syariah secara full online"; the
// account agreement prices "transaksi melalui online trading" for every
// share trade. No MNC page names a list of its own, a board it refuses or
// an excluded share, so the book is the exchange's whole listing less the
// lines that cannot trade (suspended, delisted, not yet listed, no trade
// in 20 sessions), read by ../stockbit/idxBook.mjs. ETFs trade in the same
// book and nothing leaves them out, so they stay; the Watchlist board
// stays. The sharia account is a second account type, not a narrower
// catalogue of the conventional one, so the whole listing is kept.
// Everything trades in rupiah.
//
//   https://www.mncsekuritas.id/pages/equity/
//   https://www.mncsekuritas.id/assetweb//download/OA%20INSTITUSI%202026%20Interaktif_1778143804.pdf
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the account-opening agreement, section 10.1 b ("Untuk transaksi
// melalui online trading sebesar 0,1815% (transaksi beli) dan 0,2815%
// (transaksi jual) dari nilai transaksi atau biaya minimum maksimal Rp
// 10.000"; same-day round trips 0,1513% / 0,2513%; through a dealer
// 0,2522% / 0,3522%). It is the institutional form, the only one MNC
// publishes; the clause is not limited to institutions. The run checks it
// and the equity page before writing.
//
//   node brokers/mncsekuritas/mncsekuritas_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { pdfSays } from "../bcasekuritas/pdfSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const AGREEMENT = "https://www.mncsekuritas.id/assetweb//download/OA%20INSTITUSI%202026%20Interaktif_1778143804.pdf";

await pageSays("https://www.mncsekuritas.id/pages/equity/", [/Pembukaan rekening efek konvensional dan syariah secara full online/i]);
await pdfSays(AGREEMENT, [
  /Untuk transaksi melalui online trading sebesar 0,1815% \(transaksi beli\) dan 0,2815% \(transaksi jual\)/i,
]);

await writeIdxCatalogue(import.meta.url, "mncsekuritas-parsed.json");
