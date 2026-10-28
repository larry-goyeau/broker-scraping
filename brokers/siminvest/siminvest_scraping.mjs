// What SimInvest (PT Sinarmas Sekuritas) sells, with no login: every share
// and ETF on the Indonesia Stock Exchange, its only place. The app is
// "Solusi investasi saham & reksa dana"; its help centre names no share,
// board or segment it does not trade, and ETFs trade in the exchange's
// same book, so the book is the exchange's whole listing
// (../stockbit/idxBook.mjs), less the lines that cannot trade (suspended,
// delisted, no trade in 20 sessions). The Watchlist board is kept: its
// notice on full call auction tells clients how to check "Saham dalam
// Papan Pemantauan Khusus di SimInvest" and trade them. Mutual funds
// (reksa dana), warrants, rights and bonds are not listed shares or ETFs
// and stay out.
//
//   https://siminvest.co.id/
//   https://help.siminvest.id/bei-terapkan-full-call-auction/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://help.siminvest.id/berapa-fee-transaksi-yang-berlaku-di-sinarmas-sekuritas/
// (online trading 0.1403% to buy, 0.2403% to sell; lower monthly tiers)
//
//   node brokers/siminvest/siminvest_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEES = "https://help.siminvest.id/berapa-fee-transaksi-yang-berlaku-di-sinarmas-sekuritas/";
const FCA = "https://help.siminvest.id/bei-terapkan-full-call-auction/";
const EVIDENCE = [
  { url: FEES, pattern: /Online Trading 0,1403% 0,2403%/i },
  { url: FCA, pattern: /Papan Pemantauan Khusus di SimInvest/i },
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

await writeIdxCatalogue(import.meta.url, "siminvest-parsed.json");
