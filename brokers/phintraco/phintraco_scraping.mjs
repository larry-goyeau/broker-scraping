// What Phintraco Sekuritas sells, with no login: every share and ETF on the
// Indonesia Stock Exchange, its only place. Its FAQ lists what its online
// platform trades: "Saham Reguler – Saham Syariah – Primary Bond". Sharia
// shares are a subset of the listed shares, and no page names a share,
// board or segment it does not trade, nor excludes ETFs, which IDX trades
// through the same JATS order book as shares; so the book is the
// exchange's whole listing (../stockbit/idxBook.mjs), less the lines that
// cannot trade (suspended, delisted, no trade in 20 sessions). The
// Watchlist board (Papan Pemantauan Khusus, full call auction) is kept: no
// Phintraco page excludes it. Bonds (SBN), warrants, rights and mutual
// funds are not listed shares or ETFs and stay out. Phintraco sells no
// foreign shares.
//
//   https://phintracosekuritas.com/pertanyaan-umum/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://phintracosekuritas.com/pertanyaan-umum/
// ("Fee transaksi di Phintraco Sekuritas hanya 0,15% fee beli dan 0,25% fee jual")
//
//   node brokers/phintraco/phintraco_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://phintracosekuritas.com/pertanyaan-umum/";
const EVIDENCE = [
  { url: FAQ, pattern: /Saham Reguler\s*\S+\s*Saham Syariah/i },
  { url: FAQ, pattern: /0,15% fee beli dan 0,25% fee jual/i },
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

await writeIdxCatalogue(import.meta.url, "phintraco-parsed.json");
