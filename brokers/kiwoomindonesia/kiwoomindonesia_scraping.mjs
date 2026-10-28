// What Kiwoom Sekuritas Indonesia sells, with no login: every share and
// ETF of the Indonesia Stock Exchange, its only place. Its FAQ answers
// "What services are offered": "buying and selling shares on the IDX both
// online (via our Home Trading System – HERO on PC or Smartphone) and
// offline (through dealers)". No page names a list of its own, a board it
// refuses or any excluded share, so the book is the exchange's whole
// listing less the lines that cannot trade (suspended, delisted, not yet
// listed, no trade in 20 sessions), read by ../stockbit/idxBook.mjs.
// ETFs trade on the exchange like shares and nothing on the site leaves
// them out, so they stay. The Watchlist board (full call auction) stays:
// no page excludes it. The margin account's "All marginable stocks listed"
// is a limit of that account only, not of the regular account. Mutual
// funds (reksa dana) are not listed securities and stay out, and so do
// warrants, rights and real-estate investment funds (DIRE). The FAQ names
// no market but the IDX. Everything trades in rupiah.
//
//   https://www.kiwoom.co.id/cs/getFAQ
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://www.kiwoom.co.id/cs/getFAQ (FAQ 4.1: HERO online 0.15% to
// buy, 0.25% to sell; through a dealer 0.25% and 0.35%). The run checks
// the service and fee answers before writing.
//
//   node brokers/kiwoomindonesia/kiwoomindonesia_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://www.kiwoom.co.id/cs/getFAQ";
const EVIDENCE = [
  /buying and selling shares on the IDX both online/i,
  /Fee if using HERO is as follows: Buy transaction: 0\.15% Sell transaction: 0\.25%/i,
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

const faq = plain(await fetchText(FAQ));
for (const pattern of EVIDENCE) {
  if (!pattern.test(faq)) throw new Error(`${FAQ} no longer says ${pattern}`);
}

await writeIdxCatalogue(import.meta.url, "kiwoomindonesia-parsed.json");
