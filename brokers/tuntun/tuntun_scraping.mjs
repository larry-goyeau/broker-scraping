// What Tuntun Sekuritas Indonesia sells, with no login: every share and
// ETF of the Indonesia Stock Exchange, its only place. Its site sells two
// products, "Saham" (shares) and "Reksa Dana" (mutual funds), and its
// data centre is "terhubung langsung ke server IDX" (connected straight to
// the IDX servers). No page names a list of its own, a board it refuses or
// any excluded share, so the book is the exchange's whole listing less the
// lines that cannot trade (suspended, delisted, not yet listed, no trade
// in 20 sessions), read by ../stockbit/idxBook.mjs. ETFs trade on the
// exchange like shares and nothing on the site leaves them out, so they
// stay; the Watchlist board (full call auction) stays too. Mutual funds
// are not listed securities and stay out, and so do warrants, rights and
// real-estate investment funds (DIRE). Everything trades in rupiah.
//
//   https://www.tuntun.co.id/id
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: https://www.tuntun.co.id/id, "Saham" tab, "Fixed Fee": the figures
// are an image, https://www.tuntun.co.id/static/fees-new.png ("BUY FEE
// 0,15%", "SELL FEE 0,25%"), with the note "Sudah termasuk biaya broker,
// biaya Levy (BEI, KPEI, KSEI) 0.0433%, PPN Biaya broker 11%, and PPh
// Final untuk Transaksi jual 0.1%" (levies and taxes included). The run
// checks the note and that the fee image is the one read on 25 Oct 2026
// (same size) before writing; a new image needs a new look.
//
//   node brokers/tuntun/tuntun_scraping.mjs

import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.tuntun.co.id";
const PAGE = `${SITE}/id`;
const FEE_IMAGE = `${SITE}/static/fees-new.png`;
const FEE_IMAGE_BYTES = 244955;
const EVIDENCE = [
  /Fixed Fee/,
  /Sudah termasuk biaya broker, biaya Levy \(BEI, KPEI, KSEI\) 0\.0433%/,
  /fees-new\.png/,
];

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

const page = await (await fetchOk(PAGE)).text();
for (const pattern of EVIDENCE) {
  if (!pattern.test(page)) throw new Error(`${PAGE} no longer says ${pattern}`);
}
await new Promise((resolve) => setTimeout(resolve, 1000));
const image = Buffer.from(await (await fetchOk(FEE_IMAGE)).arrayBuffer());
if (image.length !== FEE_IMAGE_BYTES) throw new Error(`${FEE_IMAGE} changed (${image.length} bytes): read the fees again`);

await writeIdxCatalogue(import.meta.url, "tuntun-parsed.json");
