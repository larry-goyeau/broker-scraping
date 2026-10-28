// What Victoria Sekuritas Indonesia sells, with no login: every share and
// ETF on the Indonesia Stock Exchange, its only place. Its FAQ says "Anda
// bisa berinvestasi dalam produk saham maupun obligasi", traded through its
// Vista app. No page names a share, board or segment it does not trade, nor
// excludes ETFs, which IDX trades through the same JATS order book as
// shares; so the book is the exchange's whole listing
// (../stockbit/idxBook.mjs), less the lines that cannot trade (suspended,
// delisted, no trade in 20 sessions). The Watchlist board (Papan
// Pemantauan Khusus, full call auction) is kept: no Victoria page excludes
// it. Bonds, warrants, rights and mutual funds are not listed shares or
// ETFs and stay out. Victoria sells no foreign shares.
//
//   https://victoria-sekuritas.co.id/faq/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://victoria-sekuritas.co.id/faq/
// (buy "mulai dari 0,15%", sell "mulai dari (0,15% + pajak 0,1%)")
//
//   node brokers/victoriaindonesi/victoriaindonesi_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://victoria-sekuritas.co.id/faq/";
const EVIDENCE = [
  { url: FAQ, pattern: /berinvestasi dalam produk saham maupun obligasi/i },
  { url: FAQ, pattern: /biaya mulai dari 0,15% dari nilai pembelian/i },
  { url: FAQ, pattern: /mulai dari \(0,15% \+ pajak 0,1%\) dari nilai penjualan/i },
];

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const html = await response.text();
        return html
          .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/g, " ")
          .replace(/\s+/g, " ");
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

const pages = new Map();
for (const { url, pattern } of EVIDENCE) {
  if (!pages.has(url)) pages.set(url, await fetchText(url));
  if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern}`);
}

await writeIdxCatalogue(import.meta.url, "victoriaindonesi-parsed.json");
