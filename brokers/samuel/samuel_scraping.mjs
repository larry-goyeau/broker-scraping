// What Samuel Sekuritas Indonesia sells through STAR, with no login: every
// share and ETF on the Indonesia Stock Exchange, its only place. Its FAQ
// says STAR is for clients "bertransaksi saham secara online dan real time
// di Bursa Efek Indonesia" and names no share, board or segment it does
// not trade. ETFs trade in the exchange's same book and are kept. The book
// is the exchange's whole listing (../stockbit/idxBook.mjs), less the lines
// that cannot trade (suspended, delisted, no trade in 20 sessions); the
// Watchlist board is kept, as no Samuel page excludes it. Warrants, rights,
// bonds and mutual funds stay out.
//
//   https://star.id/faq
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://star.id/faq ("Pricing": online trading 0.15% to buy, 0.25%
// to sell; full service 0.25% / 0.35%)
//
//   node brokers/samuel/samuel_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://star.id/faq";
const EVIDENCE = [
  { url: FAQ, pattern: /Fee Beli 0,15% net 0,25% net Fee Jual 0,25% net 0\.35% net/i },
  { url: FAQ, pattern: /bertransaksi saham secara online dan real time di Bursa Efek Indonesia/i },
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

await writeIdxCatalogue(import.meta.url, "samuel-parsed.json");
