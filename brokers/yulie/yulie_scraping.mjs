// What Yulie Sekuritas Indonesia sells through its YOUTRADE app, with no
// login: every share and ETF of the Indonesia Stock Exchange, its only
// place. The YOUTRADE page says "Find all Indonesian stock investment via
// YOUTRADE app and start you investment in Indonesia Stock Exchange's
// Market". No page names a list of its own, a board it refuses or any
// excluded share, so the book is the exchange's whole listing less the
// lines that cannot trade (suspended, delisted, not yet listed, no trade
// in 20 sessions), read by ../stockbit/idxBook.mjs. ETFs trade on the
// exchange like shares and nothing on the site leaves them out, so they
// stay; the Watchlist board (full call auction) stays too. Warrants,
// rights, real-estate investment funds (DIRE) and mutual funds are not in
// the book. Everything trades in rupiah.
//
//   https://youtrade.yuliesekuritas.com/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://youtrade.yuliesekuritas.com/ ("Commission Fee 0.15% Buy
// 0.25% Sell", broker, exchange and tax fees included). The run checks
// both sentences before writing.
//
//   node brokers/yulie/yulie_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://youtrade.yuliesekuritas.com/";
const EVIDENCE = [
  /Find all Indonesian stock investment via YOUTRADE app/i,
  /Commission Fee 0\.15% Buy 0\.25% Sell/i,
];

const plain = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

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

const page = plain(await fetchText(PAGE));
for (const pattern of EVIDENCE) {
  if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
}

await writeIdxCatalogue(import.meta.url, "yulie-parsed.json");
