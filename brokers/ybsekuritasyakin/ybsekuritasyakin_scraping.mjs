// What YB Sekuritas (PT Yakin Bertumbuh Sekuritas) sells through its JOIN
// apps, with no login: shares on the Indonesia Stock Exchange, its only
// place. Its FAQ describes the firm as "anggota bursa yang tercantum di
// website IDX" and covers online trading, the negotiated market, e-IPO and
// margin. No page names a list of its own, an excluded board or an
// excluded line, so the book is the exchange's whole listing: every share
// and ETF IDX lists, less the lines that cannot trade (suspended, delisted,
// not yet listed, no trade in 20 sessions; see ../stockbit/idxBook.mjs).
// ETFs are kept: they trade in the same IDX order book and no YB page
// excludes them. Rights and warrants (the FAQ covers exercising them),
// real-estate and infrastructure funds (DIRE, DINFRA) and mutual funds stay
// out. YB sells no foreign shares.
//
// Odd lots go through sales ("Untuk stock odd lot ... silakan hubungi sales
// masing-masing nasabah") and margin needs an approved account: conditions
// on the order or the client, so remarks, not removals.
//
//   https://www.yb.co.id/
//   https://www.yb.co.id/faq
//
// Fees: https://www.yb.co.id/faq ("Melalui Online Trading: Fee beli: 0.151%
// Fee jual: 0.251%"; through sales/dealer 0.201% and 0.301%). The run
// checks that sentence before writing.
//
//   node brokers/ybsekuritasyakin/ybsekuritasyakin_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: "https://www.yb.co.id/faq", pattern: /Online Trading:? ?Fee beli: 0\.151% Fee jual: 0\.251%/i },
  { url: "https://www.yb.co.id/faq", pattern: /anggota bursa/i },
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

await writeIdxCatalogue(import.meta.url, "ybsekuritasyakin-parsed.json");
