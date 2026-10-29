// What Santander Corredores de Bolsa Limitada (Banco Santander Chile)
// sells online in shares and ETFs, with no login. Its broker page sells
// local shares through the Santander Chile app ("Inversiones", "Acciones")
// and the website, and by phone (600 320 3000). It publishes no list and
// names no restriction.
//
//   https://banco.santander.cl/personas/corredores-de-bolsa
//
// broker-list.json names one place, the Santiago Stock Exchange. So the
// catalogue is the Bolsa de Comercio de Santiago's share and ETF book, read
// by ../banchile/santiagoBook.mjs: Chilean shares, the foreign shares and
// ETFs of the exchange's foreign-securities market and the Chilean ETFs, in
// pesos and in dollars as the exchange quotes each line (ordinary
// investment and mutual-fund lines and dormant lines left out there).
//
// Fees (same page): renta variable local, maximum cost "1% + IVA", internet
// "0,35% + IVA". banco.santander.cl answers 403 to scripts, so the run
// checks no page of the broker.
//
// The Santiago exchange's site sits behind a bot manager: the price list is
// read in the owner's Chrome on port 9222 (see ../banchile/santiagoBook.mjs).
//
//   node brokers/santandercl/santandercl_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { santiagoBook } from "../banchile/santiagoBook.mjs";

const book = await santiagoBook("Santander Corredores de Bolsa Chile");
const rows = stampRows(withoutObligations(book.map(({ traded, ...row }) => row)));
fs.writeFileSync(new URL("santandercl-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
console.error(`Santander Corredores de Bolsa Chile: ${rows.length} Santiago rows`, book.kinds, `left out ${book.dropped.length}`);
