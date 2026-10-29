// What Ciptadana Sekuritas Asia sells online through its PinePick app, with
// no login: every share and ETF of the Indonesia Stock Exchange, its only
// place (the broker-list row names IDX alone). The PinePick site says
// "Investasikan Assetmu pada saham melalui PinePick dengan biaya transaksi
// yang kompetitif" and names no list of its own, no board it refuses and no
// excluded share, so the book is the exchange's whole listing less the
// lines that cannot trade (suspended, delisted, not yet listed, no trade
// in 20 sessions), read by ../stockbit/idxBook.mjs. ETFs trade in the same
// book and nothing leaves them out, so they stay; the Watchlist board
// stays. Everything trades in rupiah.
//
// The site is a single-page app: its text is in the script bundle the page
// loads (/assets/index-<hash>.js), which the run finds and reads.
//
//   https://pinepick.ciptadana.com/
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the same site ("Tanpa biaya bulanan, tanpa biaya materai, cukup
// dengan fee beli 0.1513% dan jual 0.2513%."). The run checks both
// sentences before writing.
//
//   node brokers/ciptadana/ciptadana_scraping.mjs

import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const SITE = "https://pinepick.ciptadana.com/";

const html = await pageSays(SITE, [/<title>PinePick<\/title>/i], { raw: true });
const bundle = html.match(/src="(\/assets\/index-[^"]+\.js)"/)?.[1];
if (!bundle) throw new Error(`${SITE} no longer loads an /assets/index-*.js bundle`);
await pageSays(new URL(bundle, SITE).href, [
  /cukup dengan fee beli 0\.1513% dan jual 0\.2513%/i,
  /Investasikan Assetmu pada saham melalui PinePick/i,
], { raw: true });

await writeIdxCatalogue(import.meta.url, "ciptadana-parsed.json");
