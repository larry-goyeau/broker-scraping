// What Yuanta Sekuritas Indonesia sells, with no login: every share and
// ETF of the Indonesia Stock Exchange, its only place. Its product summary
// (RIPLAY) says "We provide securities trading services through the
// Indonesia Stock Exchange (IDX)" through the YSInvest and YuantaConnect
// apps or its sales desk, and "Clients are granted access to equity and
// derivative products listed and traded on the Indonesia Stock Exchange."
// No page names a list of its own, a board it refuses or any excluded
// share, so the book is the exchange's whole listing less the lines that
// cannot trade (suspended, delisted, not yet listed, no trade in 20
// sessions), read by ../stockbit/idxBook.mjs. ETFs are listed equity
// products and nothing leaves them out, so they stay; the Watchlist board
// (full call auction) stays too. Bonds and repos (sold over the counter),
// warrants, rights and real-estate investment funds (DIRE) are not in the
// book. Everything trades in rupiah.
//
//   https://www.yuanta.co.id/inc/uploads/content/RIPLAY.pdf
//   https://www.yuanta.co.id/page/faq
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://www.yuanta.co.id/page/faq ("The Transaction fee for online
// trading as follows : Buy 0.15%, Sell 0.25%"; through sales 0.25% and
// 0.35%), the same in the RIPLAY. The run checks the FAQ answer and that
// the RIPLAY is still served before writing.
//
//   node brokers/yuantaindonesia/yuantaindonesia_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FAQ = "https://www.yuanta.co.id/page/faq";
const RIPLAY = "https://www.yuanta.co.id/inc/uploads/content/RIPLAY.pdf";
const FEE = /The Transaction fee for online trading as follows : Buy 0\.15%, Sell 0\.25%/i;

const plain = (html) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

async function fetchOk(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const faq = plain(await (await fetchOk(FAQ)).text());
if (!FEE.test(faq)) throw new Error(`${FAQ} no longer says ${FEE}`);
await new Promise((resolve) => setTimeout(resolve, 1000));
const riplay = Buffer.from(await (await fetchOk(RIPLAY)).arrayBuffer());
if (riplay.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${RIPLAY} is no longer a PDF`);

await writeIdxCatalogue(import.meta.url, "yuantaindonesia-parsed.json");
