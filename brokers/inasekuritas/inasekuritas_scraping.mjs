// What INA Sekuritas Indonesia sells online through UNO, with no login:
// every share and ETF of the Indonesia Stock Exchange, its only place (the
// broker-list row names IDX alone). Its Play Store text says "UNO by Ina
// Sekuritas adalah sistem perdagangan saham mobile yang memungkinkan
// nasabah memasukkan sendiri order jual atau beli melalui aplikasi ...
// tanpa harus melalui perantara (dealer)" and calls UNO the "Platform
// Perdagangan Pasar Saham Indonesia". No INA page names a list of its own,
// a board it refuses or an excluded share, so the book is the exchange's
// whole listing less the lines that cannot trade (suspended, delisted,
// not yet listed, no trade in 20 sessions), read by
// ../stockbit/idxBook.mjs. ETFs trade in the same book and nothing leaves
// them out, so they stay; the Watchlist board stays. Everything trades in
// rupiah.
//
//   https://uno.inasekuritas.com/
//   https://play.google.com/store/apps/details?id=rb.uno.inasekuritas&hl=id
//   https://www.idx.co.id/en/market-data/stocks-data/stock-list
//
// Fees: the UNO site's "Biaya Transaksi" block, "Beli: 0,15%" and "Jual:
// 0,25%", all in ("Sudah termasuk biaya broker, BEI, KPEI, KSEI, PPN dan
// PPh"). The two figures are drawn as pictures (/storage/img/beli.svg and
// jual.svg) with no text in them, so the run checks the block's note and
// stops if either picture changes (SHA-256 below, read 28 October 2026).
//
//   node brokers/inasekuritas/inasekuritas_scraping.mjs

import crypto from "node:crypto";
import { pageSays } from "../bajaj/pageSays.mjs";
import { writeIdxCatalogue } from "../stockbit/idxBook.mjs";

const SITE = "https://uno.inasekuritas.com/";
const FEE_PICTURES = {
  "/storage/img/beli.svg": "e8f26a34e4aeaa81172f1dacb37a700bc1068759aa201f5f05e2a76ab553fcd7", // Beli: 0,15%
  "/storage/img/jual.svg": "4f6a21d021dc97ee04d7fc625f2cf588e7e283b2397ada437f5acc99f58f5782", // Jual: 0,25%
};

const html = await pageSays(SITE, [/Biaya Transaksi/, /Sudah termasuk biaya broker, BEI, KPEI, KSEI, PPN dan PPh/i], { raw: true });
for (const [file, sha] of Object.entries(FEE_PICTURES)) {
  if (!html.includes(`src="${file}"`)) throw new Error(`${SITE} no longer shows ${file}`);
  const svg = await pageSays(new URL(file, SITE).href, [/<svg/i], { raw: true });
  const got = crypto.createHash("sha256").update(svg).digest("hex");
  if (got !== sha) throw new Error(`${file} changed (sha256 ${got}): read the fee again`);
}
await pageSays("https://play.google.com/store/apps/details?id=rb.uno.inasekuritas&hl=id", [
  /sistem perdagangan saham mobile yang memungkinkan nasabah memasukkan sendiri order jual atau beli/i,
]);

await writeIdxCatalogue(import.meta.url, "inasekuritas-parsed.json");
