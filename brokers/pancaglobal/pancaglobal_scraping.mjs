// What Panca Global Sekuritas sells through its Hei5 platform, with no
// login: shares on the Indonesia Stock Exchange, its only place. The
// product page sells Hei5 as the way "untuk memulai Investasi saham dan
// melakukan Transaksi jual beli saham dimana saja", from a firm "Resmi
// terdaftar sebagai Anggota Bursa Efek Indonesia". No page (product, FAQ)
// names a list of its own, an excluded board or an excluded line, so the
// book is the exchange's whole listing: every share and ETF IDX lists,
// less the lines that cannot trade (suspended, delisted, not yet listed, no
// trade in 20 sessions; see ../stockbit/idxBook.mjs). ETFs are kept: they
// trade in the same IDX order book and no Hei5 page excludes them.
// Warrants, rights, real-estate and infrastructure funds (DIRE, DINFRA)
// and mutual funds stay out. Hei5 sells no foreign shares.
//
// Online account opening asks for "WNI yang telah memiliki e-KTP" and a
// BCA account (https://www.hei5.id/faq): a condition on the client, not on
// the shares, so it is a remark, not a removal.
//
//   https://www.hei5.id/product
//   https://www.hei5.id/faq
//
// Fees: https://www.hei5.id/product ("Biaya Transaksi (Beli 0,1% dan Jual
// 0,2% - All in)"). The run checks that sentence before writing.
//
//   node brokers/pancaglobal/pancaglobal_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = [
  { url: "https://www.hei5.id/product", pattern: /Beli 0,1% dan Jual 0,2% - All in/i },
  { url: "https://www.hei5.id/product", pattern: /Transaksi jual beli saham/i },
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

await writeIdxCatalogue(import.meta.url, "pancaglobal-parsed.json");
