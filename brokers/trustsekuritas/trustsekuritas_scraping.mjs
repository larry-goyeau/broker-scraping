// What Trust Sekuritas sells through its PINA Trade app, with no login:
// shares on the Indonesia Stock Exchange, its only place. The site calls
// PINA Trade "platform trading saham" from "PT Trust Sekuritas ... Anggota
// Bursa" and names no list of its own, no excluded board and no excluded
// line, so the book is the exchange's whole listing: every share and ETF
// IDX lists, less the lines that cannot trade (suspended, delisted, not yet
// listed, no trade in 20 sessions; see ../stockbit/idxBook.mjs). ETFs are
// kept: they trade in the same IDX order book and no PINA page excludes
// them. Warrants, rights, real-estate and infrastructure funds (DIRE,
// DINFRA), mutual funds and the single stock futures the page announces as
// "Coming Soon" stay out. PINA sells no foreign shares.
//
//   https://www.pinatrade.id/
//
// Fees: https://www.pinatrade.id/ (FAQ "Berapa transaction fee di PINA
// Trade?": "buy fee 0,15% dan sell fee 0,25% tanpa ada biaya tambahan
// setiap bulan"). The run checks that sentence before writing.
//
//   node brokers/trustsekuritas/trustsekuritas_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: "https://www.pinatrade.id/", pattern: /buy fee 0,15% dan sell fee 0,25%/i },
  { url: "https://www.pinatrade.id/", pattern: /platform trading saham/i },
];

async function pageText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        const html = await response.text();
        return html
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;| |​/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ");
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

const pages = new Map();
for (const { url, pattern } of EVIDENCE) {
  if (!pages.has(url)) {
    pages.set(url, await pageText(url));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!pattern.test(pages.get(url))) throw new Error(`${url} no longer says ${pattern}`);
}

await writeIdxCatalogue(import.meta.url, "trustsekuritas-parsed.json");
