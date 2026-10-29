// What BBVA Trader (BBVA México's self-directed trading service in the
// BBVA app) sells in shares and exchange-traded funds, with no login. BBVA
// prints no list.
//
// The BBVA Trader page (read 2026-10-28): "Mercado nacional: Compra y vende
// acciones de empresas que cotizan en las bolsas de valores de México (BMV
// y BIVA)", "Mercado global: Compra ETFs y acciones de empresas listadas en
// el Sistema Internacional de Cotizaciones (SIC)", "Invierte en bolsa de
// forma sencilla desde la app BBVA"; fees: "Toda operación genera una
// comisión de 0.23% + IVA. En operaciones a partir de $1,000,001 es de
// 0.18% + IVA". Both Mexican exchanges are named, so the catalogue has two
// places, each its whole book (owner's rule for a place with no list),
// read the same way by ../actinvertrade/bmvBook.mjs (the BIVA board with
// { board: "BIVA" }): every share, depositary receipt, FIBRA and ETF (ETCs
// and ETNs too) of the local board and the SIC, in pesos. Left out there:
// CKD and CERPI certificates, other trust and mutual-fund certificates,
// warrants and rights, lines never traded on that exchange, Mexican lines
// with no trade there for over a year (suspended or delisted) and SIC lines
// with no trade there for over a year whose home listing is gone. A title
// on both exchanges is one row per exchange. No BBVA page excludes a board,
// a segment, ETFs or SIC lines; SIC lines open only to qualified investors
// depend on the client: a remark, not a removal. broker-list.json gives
// "Bolsa Mexicana" and "BIVA", the same places.
//
//   https://www.bbva.mx/personas/productos/inversion/bbva-trader.html   (offer and fees)
//
//   node brokers/bbvamx/bbvamx_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";

await pageSays("https://www.bbva.mx/personas/productos/inversion/bbva-trader.html", [
  /cotizan en las bolsas de valores de México \(BMV y BIVA\)/,
  /Compra ETFs y acciones de empresas listadas en el Sistema Internacional de Cotizaciones \(SIC\)/,
  /Toda operación genera una comisión de 0\.23%/,
]);

const bmv = await bmvBook();
const biva = await bmvBook({ board: "BIVA" });
const rows = stampRows(withoutObligations([...bmv.rows, ...biva.rows].filter((row) => row.type !== "FUND")));
for (const [mic, ticker] of [["XMEX", "WALMEX"], ["XMEX", "AAPL"], ["XMEX", "NAFTRAC/ISHRS"], ["BIVA", "WALMEX"], ["BIVA", "AAPL"]]) {
  if (!rows.some((row) => row.mic === mic && row.ticker === ticker)) throw new Error(`${mic} ${ticker} is missing`);
}
fs.writeFileSync(new URL("bbvamx-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`BMV: dropped ${bmv.dropped.length}, quiet SIC kept ${bmv.quiet.length}; BIVA: dropped ${biva.dropped.length}, quiet SIC kept ${biva.quiet.length}`);
