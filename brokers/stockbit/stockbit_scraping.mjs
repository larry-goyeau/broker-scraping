// What Stockbit Sekuritas Digital sells, with no login: every share and ETF
// on the Indonesia Stock Exchange, its only place. Its fee article prices
// shares ("Fee beli 0.15% Fee Jual 0.25%") and, separately, "Fee ETF, right
// dan warrant (beli & jual)", so ETFs are kept. No help article names a
// share, board or segment it does not trade, so the book is the exchange's
// whole listing (./idxBook.mjs), less the lines that cannot trade
// (suspended, delisted, no trade in 20 sessions). The Watchlist board
// (Papan Pemantauan Khusus, full call auction) is kept: no Stockbit page
// excludes it. Rights, warrants, structured warrants and government bonds
// (Obligasi FR), which Stockbit also sells, are not shares or ETFs and stay
// out, as do mutual funds (sold by its sister app Bibit).
//
//   https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/
//   https://help.stockbit.com/id/article/apa-keunggulan-trading-di-stockbit-1sfvywt/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/
// (0.15% to buy, 0.25% to sell; ETFs 0.15% both ways)
//
//   node brokers/stockbit/stockbit_scraping.mjs

import { writeIdxCatalogue } from "./idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEES = "https://help.stockbit.com/id/article/transaksi-saham-berapa-biaya-trading-di-stockbit-sekuritas-1lbkyq9/";
const EVIDENCE = [
  { url: FEES, pattern: /Fee beli 0\.15% Fee Jual 0\.25%/i },
  { url: FEES, pattern: /Fee ETF, right dan warrant/i },
];

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const html = await response.text();
        return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
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

await writeIdxCatalogue(import.meta.url, "stockbit-parsed.json");
