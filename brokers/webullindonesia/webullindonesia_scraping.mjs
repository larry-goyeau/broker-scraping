// What Webull Indonesia (PT Webull Sekuritas Indonesia) sells, with no
// login: shares and ETFs on the Indonesia Stock Exchange, its only place.
// Its help centre says "kamu dapat melakukan trading saham domestik
// (Indonesia), reksa dana, ETF, dan waran terstruktur pada platform
// Webull", and on ETFs "kamu dapat melakukan transaksi ETF pada Pasar
// Sekunder". No page names a list of its own or an excluded board or
// line, so the book is the exchange's whole listing: every share and ETF
// IDX lists, less the lines that cannot trade (suspended, delisted, not
// yet listed, no trade in 20 sessions; see ../stockbit/idxBook.mjs).
// Structured warrants are left out as warrants are in every scraper;
// mutual funds (reksa dana) are not listed securities and stay out, and so
// do rights and real-estate and infrastructure funds (DIRE, DINFRA). The
// Indonesian entity sells no foreign shares.
//
//   https://www.webull.co.id/help/faq/11
//   https://www.webull.co.id/help/faq/284
//   https://www.webull.co.id/en/help/faq/163-How-to-sell-stocks-from-Webull-application
//
// Fees: https://www.webull.co.id/pricing ("Komisi Biaya Beli 0,15%",
// "Komisi Biaya Jual 0,25%", all in; 0,09% and 0,19% during the promotion
// "dari Februari hingga Desember 2026"). The run checks the products
// sentence and the standard rates before writing.
//
//   node brokers/webullindonesia/webullindonesia_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: "https://www.webull.co.id/pricing", pattern: /Komisi Biaya Beli 0,15%/ },
  { url: "https://www.webull.co.id/pricing", pattern: /Komisi Biaya Jual 0,25%/ },
  { url: "https://www.webull.co.id/help/faq/11", pattern: /trading saham domestik \(Indonesia\), reksa dana, ETF/i },
  { url: "https://www.webull.co.id/help/faq/284", pattern: /transaksi ETF pada Pasar Sekunder/i },
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

await writeIdxCatalogue(import.meta.url, "webullindonesia-parsed.json");
