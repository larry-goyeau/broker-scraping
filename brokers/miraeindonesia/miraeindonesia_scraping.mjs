// What Mirae Asset Sekuritas Indonesia sells through M-STOCK, with no
// login: every share and ETF on the Indonesia Stock Exchange, its only
// place. The M-STOCK page lists its instruments as "Stock Bonds ETF
// Structured Warrants" and invites clients to "Start Investing in ETFs
// (Exchange-Traded Fund)", so ETFs are kept. No page names a share, board
// or segment it does not trade, so the book is the exchange's whole listing
// (../stockbit/idxBook.mjs), less the lines that cannot trade (suspended,
// delisted, no trade in 20 sessions). The Watchlist board (Papan Pemantauan
// Khusus, full call auction) is kept: no Mirae page excludes it. Bonds,
// structured warrants, rights and warrants are not shares or ETFs and stay
// out.
//
//   https://sekuritas.miraeasset.co.id/m-stock
//   https://sekuritas.miraeasset.co.id/m-stock/etf
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://sekuritas.miraeasset.co.id/m-stock ("Competitive Transaction
// Fees 0.15% Buy 0.25% Sell")
//
//   node brokers/miraeindonesia/miraeindonesia_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://sekuritas.miraeasset.co.id/m-stock";
const EVIDENCE = [
  { url: PAGE, pattern: /0\.15% Buy 0\.25% Sell/i },
  { url: PAGE, pattern: /Stock Bonds ETF Structured Warrants/i },
  { url: PAGE, pattern: /Start Investing in ETFs/i },
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

await writeIdxCatalogue(import.meta.url, "miraeindonesia-parsed.json");
