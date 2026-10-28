// What Korea Investment & Sekuritas Indonesia (KISI) sells, with no login:
// every share and ETF of the Indonesia Stock Exchange, its only place.
// Its regular account ("Akun Reguler", /produk/saham) is the account for
// share trading through the KOINS app, with "Fee transaksi beli 0,13% dan
// jual 0,23%". Its ETF product page (/produk/etf) says "Reksa Dana ETF ...
// diperjualbelikan layaknya seperti saham di bursa" (traded like shares on
// the exchange), so the exchange's ETFs stay. No page names a list of its
// own, a board it refuses or any excluded share, so the book is the
// exchange's whole listing less the lines that cannot trade (suspended,
// delisted, not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. The Watchlist board (full call auction) stays.
// The margin account's own list of marginable shares limits that account
// only. Structured warrants (waran terstruktur), bonds, mutual funds,
// rights and real-estate investment funds (DIRE) are not in the book.
// Everything trades in rupiah.
//
// The site is a React app; its pages are in the bundle /static/js/main.*.js
// named by the page.
//
//   https://www.kisi.co.id/produk/saham
//   https://www.kisi.co.id/produk/etf
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://www.kisi.co.id/produk/saham (0.13% to buy, 0.23% to sell;
// the home page's "Biaya Transaksi" shows the same). The run checks the fee
// and ETF sentences in the bundle before writing.
//
//   node brokers/koreaindonesia/koreaindonesia_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.kisi.co.id";
const PAGE = `${SITE}/produk/saham`;
const EVIDENCE = [
  /transaksi beli 0,13% dan jual 0,23%/,
  /Reksa Dana ETF adalah Reksa Dana yang kinerjanya mengacu pada indeks tertentu dan diperjualbelikan layaknya seperti saham di bursa/,
];

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const shell = await fetchText(PAGE);
const script = shell.match(/src="(\/static\/js\/main\.[0-9a-f]+\.js)"/)?.[1];
if (!script) throw new Error(`${PAGE} names no main bundle`);
await new Promise((resolve) => setTimeout(resolve, 1000));
const bundle = await fetchText(`${SITE}${script}`);
for (const pattern of EVIDENCE) {
  if (!pattern.test(bundle)) throw new Error(`${SITE}${script} no longer says ${pattern}`);
}

await writeIdxCatalogue(import.meta.url, "koreaindonesia-parsed.json");
