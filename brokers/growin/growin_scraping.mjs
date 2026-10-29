// What Growin' by Mandiri Sekuritas sells online, with no login: every
// share and ETF of the Indonesia Stock Exchange, its only place (the
// broker-list row names IDX alone; Growin' trades no foreign market).
// Growin' is Mandiri Sekuritas' own app and website: "Mandiri Sekuritas
// menghadirkan Growin', platform digital yang memungkinkan investor jual
// beli saham, reksa dana, dan obligasi kapan saja". No Mandiri page names a
// list of its own, a board it refuses or an excluded share, so the book is
// the exchange's whole listing less the lines that cannot trade
// (suspended, delisted, not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs trade in the same IDX book and nothing
// leaves them out, so they stay (rule: "all shares" includes the
// exchange's ETFs); the Watchlist board stays too. Mutual funds and bonds
// are not exchange-traded shares and are not in the book. Rupiah only.
//
//   https://growin.id/
//   https://www.mandirisekuritas.co.id/id/siaran-pers-artikel/artikel/Fee-Mandiri-Sekuritas-Apakah-Termurah-di-Indonesia
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the same Mandiri Sekuritas page ("Biaya beli saham ditetapkan
// sebesar 0,18% dari nilai transaksi, sedangkan biaya jual saham sebesar
// 0,28%"). The run checks these sentences before writing.
//
//   node brokers/growin/growin_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const MANDIRI = "https://www.mandirisekuritas.co.id/id/siaran-pers-artikel/artikel/Fee-Mandiri-Sekuritas-Apakah-Termurah-di-Indonesia";

await pageSays("https://growin.id/", [/trading platform from Mandiri Sekuritas/i]);
await pageSays(MANDIRI, [
  /Biaya beli saham ditetapkan sebesar 0,18% dari nilai transaksi, sedangkan biaya jual saham sebesar 0,28%/i,
  /Growin', platform digital yang memungkinkan investor jual beli saham/i,
]);

await writeIdxCatalogue(import.meta.url, "growin-parsed.json");
