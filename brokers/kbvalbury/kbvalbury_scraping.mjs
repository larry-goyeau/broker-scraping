// What KB Valbury Sekuritas sells, with no login: every share and ETF on the
// Indonesia Stock Exchange, its only place. Its regular-account page says
// clients "dapat bertransaksi saham" online through its HTS and MTS apps
// (KB ARA). No page names a share, board or segment it does not trade, nor
// excludes ETFs, which IDX trades through the same JATS order book as
// shares; so the book is the exchange's whole listing
// (../stockbit/idxBook.mjs), less the lines that cannot trade (suspended,
// delisted, no trade in 20 sessions). Its pages on special notations and on
// the Acceleration board only explain those IDX segments; they do not
// exclude them. The Watchlist board (Papan Pemantauan Khusus, full call
// auction) is kept. Warrants, rights, mutual funds and bonds are not listed
// shares or ETFs and stay out. KB Valbury sells no foreign shares.
//
//   https://www.kbvalbury.com/akun-reguler
//   https://www.kbvalbury.com/daftar-efek-bersifat-ekuitas-pada-papan-akselerasi
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://www.kbvalbury.com/akun-reguler
// (online trading 0.15% to buy, 0.25% to sell; remote trading through a
// broker 0.25% / 0.35%)
//
//   node brokers/kbvalbury/kbvalbury_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.kbvalbury.com/akun-reguler";
const EVIDENCE = [
  { url: PAGE, pattern: /bertransaksi saham/i },
  { url: PAGE, pattern: /Trading Online adalah sebagai berikut: Tipe Transaksi Fee Buy Fee 0,15 ?% Sell Fee 0,25 ?%/i },
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

await writeIdxCatalogue(import.meta.url, "kbvalbury-parsed.json");
