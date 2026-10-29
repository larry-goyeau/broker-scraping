// What Hey Banco (Hey Banco, S.A., Institución de Banca Múltiple, Banregio
// Grupo Financiero) sells in shares and exchange-traded funds, with no
// login. Orders are placed in the Hey Banco app. Hey prints no list.
//
// The Acciones Hey page (read 2026-10-28): "Acceso a los mercados de
// capitales nacionales e internacionales. Acciones Hey Acciones en la Bolsa
// de Valores (BMV, BIVA), Sistema Internacional de Cotizaciones (SIC), y
// Exchange Traded Funds (ETF)"; "Comisión por corretaje de 0.25%";
// "Mínimo de operación desde una acción"; "Horario de servicio de 8:30
// a.m. a 3:00 p.m (horario de las bolsas mexicanas)". Both Mexican
// exchanges are named, so the catalogue has two places, each its whole
// book (owner's rule for a place with no list), read the same way by
// ../actinvertrade/bmvBook.mjs (the BIVA board with { board: "BIVA" }):
// every share, depositary receipt, FIBRA and ETF (ETCs and ETNs too) of
// the local board and the SIC, in pesos. Left out there: CKD and CERPI
// certificates, other trust and mutual-fund certificates, warrants and
// rights, lines never traded on that exchange, Mexican lines with no trade
// there for over a year (suspended or delisted) and SIC lines with no
// trade there for over a year whose home listing is gone. A title on both
// exchanges is one row per exchange. No Hey page excludes a board, a
// segment, ETFs or SIC lines; SIC lines open only to qualified investors
// depend on the client: a remark, not a removal. broker-list.json gives
// "Bolsa Mexicana" and "BIVA", the same places.
//
//   https://banco.hey.inc/universo-hey/ahorra-e-invierte/acciones   (offer and fee)
//
//   node brokers/heybanco/heybanco_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";

await pageSays("https://banco.hey.inc/universo-hey/ahorra-e-invierte/acciones", [
  /Acciones en la Bolsa de Valores \(BMV, BIVA\), Sistema Internacional de Cotizaciones \(SIC\), y Exchange Traded Funds \(ETF\)/,
  /Comisión por corretaje de 0\.25%/,
]);

const bmv = await bmvBook();
const biva = await bmvBook({ board: "BIVA" });
const rows = stampRows(withoutObligations([...bmv.rows, ...biva.rows].filter((row) => row.type !== "FUND")));
for (const [mic, ticker] of [["XMEX", "WALMEX"], ["XMEX", "AAPL"], ["XMEX", "NAFTRAC/ISHRS"], ["BIVA", "WALMEX"], ["BIVA", "AAPL"]]) {
  if (!rows.some((row) => row.mic === mic && row.ticker === ticker)) throw new Error(`${mic} ${ticker} is missing`);
}
fs.writeFileSync(new URL("heybanco-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`BMV: dropped ${bmv.dropped.length}, quiet SIC kept ${bmv.quiet.length}; BIVA: dropped ${biva.dropped.length}, quiet SIC kept ${biva.quiet.length}`);
