// What Erdikha Elit Sekuritas sells online (ELIT Smart Order, desktop, web
// and mobile), with no login: shares on the Indonesia Stock Exchange, its
// only place. Its services page offers "layanan perdagangan efek" through
// sales and "secara online berbasis web dan mobile", plus margin and repo.
// No page (services, FAQ, the Smart Order manuals) names a list of its own,
// an excluded board or an excluded line, so the book is the exchange's
// whole listing: every share and ETF IDX lists, less the lines that cannot
// trade (suspended, delisted, not yet listed, no trade in 20 sessions; see
// ../stockbit/idxBook.mjs). ETFs are kept: they trade in the same IDX order
// book and no Erdikha page excludes them. Warrants, rights, real-estate and
// infrastructure funds (DIRE, DINFRA), mutual funds and the bonds of its
// fixed-income desk stay out. Erdikha sells no foreign shares.
//
//   https://www.erdikha.com/Layanan
//   https://www.erdikha.com/Manual%20Book%20SmartOrder%20Website%20Trading
//
// Fees: https://www.erdikha.com/FAQ ("Untuk fee beli sebesar 0,15% dan untuk
// fee jual sebesar 0,25%"). The run checks that sentence before writing.
//
//   node brokers/erdikhaelit/erdikhaelit_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: "https://www.erdikha.com/FAQ", pattern: /fee beli sebesar 0,15% dan untuk fee jual sebesar 0,25%/i },
  { url: "https://www.erdikha.com/Layanan", pattern: /perdagangan efek secara online berbasis web dan mobile/i },
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

await writeIdxCatalogue(import.meta.url, "erdikhaelit-parsed.json");
