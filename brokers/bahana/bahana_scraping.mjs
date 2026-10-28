// What Bahana Sekuritas sells, with no login: every share and ETF on the
// Indonesia Stock Exchange, its only place. Its FAQ says it serves
// "transaksi jual beli Saham di Bursa Efek Indonesia (BEI) melalui platform
// Bahana DXtrade", besides mutual funds and bonds. No page names a share,
// board or segment it does not trade, nor excludes ETFs, which IDX trades
// through the same JATS order book as shares, so the book is the exchange's
// whole listing (../stockbit/idxBook.mjs), less the lines that cannot trade
// (suspended, delisted, no trade in 20 sessions). The Watchlist board
// (Papan Pemantauan Khusus, full call auction) is kept: no Bahana page
// excludes it. Warrants, rights, mutual funds (reksa dana) and bonds are not
// listed shares or ETFs and stay out. Bahana sells no foreign shares.
//
//   https://bahanasekuritas.id/frequently-asked-questions/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://bahanasekuritas.id/frequently-asked-questions/
// ("Fee Jual kami 0.29% dan fee beli di 0.19%")
//
//   node brokers/bahana/bahana_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://bahanasekuritas.id/frequently-asked-questions/";
const EVIDENCE = [
  { url: FAQ, pattern: /jual beli Saham di Bursa Efek Indonesia/i },
  { url: FAQ, pattern: /Fee Jual kami 0\.29% dan fee beli di 0\.19%/i },
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

await writeIdxCatalogue(import.meta.url, "bahana-parsed.json");
