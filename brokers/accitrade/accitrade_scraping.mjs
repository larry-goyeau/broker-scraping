// What AcciTrade (Banamex's online trading service, Banco Nacional de
// México) sells in shares and exchange-traded funds, with no login. It
// prints no list.
//
// Its site (read 2026-10-28), "¿Qué es AcciTrade?": "AcciTrade, tu inversión
// en línea; es el acceso al mercado bursátil mexicano por medio de
// Internet ... A través de AcciTrade podrás enviar órdenes de compra y/o
// venta sobre cualquier acción que cotice en la Bolsa Mexicana de Valores y
// el SIC". "Cuotas y comisiones": "Acciones Compra / venta 0.35% por monto
// operado + IVA", "Cuota de Administración y Custodia No aplica".
//
// broker-list.json gives the place "Mexico"; AcciTrade names the Bolsa
// Mexicana and its SIC and not BIVA, so (owner's rule for a country place)
// the catalogue is the BMV alone: its whole book, local board and SIC
// ("cualquier acción"; an exchange's shares include its ETFs, owner's
// rule), read by ../actinvertrade/bmvBook.mjs: every share, depositary
// receipt, FIBRA and ETF (ETCs and ETNs too), in pesos. Left out there: CKD
// and CERPI certificates, other trust and mutual-fund certificates,
// warrants and rights, lines that never traded, Mexican lines with no
// trade for over a year (suspended or delisted) and SIC lines with no BMV
// trade for over a year whose home listing is gone. SIC lines open only to
// qualified investors depend on the client: a remark, not a removal.
//
// The site's text sits in script overlays that a plain fetch does not
// carry, so the run does not re-read it.
//
//   https://www.accitrade.com/accitrdapp/at_home.do   ("¿Qué es AcciTrade?", "Cuotas y Comisiones")
//
//   node brokers/accitrade/accitrade_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";

const { rows: book, dropped, quiet } = await bmvBook();
const rows = stampRows(withoutObligations(book.filter((row) => row.type !== "FUND")));
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the AcciTrade catalogue`);
}
fs.writeFileSync(new URL("accitrade-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(`accitrade: ${rows.length} rows ${JSON.stringify(count)}; dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);
