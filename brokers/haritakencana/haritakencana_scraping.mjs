// What Harita Kencana Sekuritas sells online through HKS Online and HKS
// Mobile, with no login: every share and ETF of the Indonesia Stock
// Exchange, its only place (the broker-list row names IDX alone). Its HKS
// Online page calls it "aplikasi trading berbasis Windows untuk nasabah
// yang membutuhkan akses transaksi, pemantauan market, portfolio"; no
// Harita page names a list of its own, a board it refuses or an excluded
// share, so the book is the exchange's whole listing less the lines that
// cannot trade (suspended, delisted, not yet listed, no trade in 20
// sessions), read by ../stockbit/idxBook.mjs. ETFs trade in the same book
// and nothing leaves them out, so they stay; the Watchlist board stays.
// Everything trades in rupiah.
//
//   https://harita-sekuritas.co.id/online-trading/hks-online
//   https://harita-sekuritas.co.id/faq
//   https://harita-sekuritas.co.id/simulasi-biaya
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the FAQ sends the client to the fee simulator ("Untuk membantu
// menghitung estimasi biaya transaksi, Anda dapat menggunakan halaman
// Simulasi Biaya"), which is set to "Komisi Broker ( 0.15 %)" on both the
// buy and the sell, plus "PPh ( 0.1 %)" on the sell. That is the only rate
// the broker prints; it is a simulator default, not a tariff sentence. The
// run checks the three pages before writing.
//
//   node brokers/haritakencana/haritakencana_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const SITE = "https://harita-sekuritas.co.id";

await pageSays(`${SITE}/online-trading/hks-online`, [/aplikasi trading berbasis Windows untuk nasabah yang membutuhkan akses transaksi/i]);
await pageSays(`${SITE}/faq`, [/Simulasi Biaya yang tersedia di website resmi PT Harita Kencana Sekuritas/i], { raw: true });
await pageSays(`${SITE}/simulasi-biaya`, [
  /Rincian Biaya Transaksi Beli Nilai Transaksi Rp 0 Komisi Broker \( 0\.15 %\)/i,
  /Rincian Biaya Transaksi Jual Nilai Transaksi Rp 0 Komisi Broker \( 0\.15 %\) Rp 0 PPh \( 0\.1 %\)/i,
]);

await writeIdxCatalogue(import.meta.url, "haritakencana-parsed.json");
