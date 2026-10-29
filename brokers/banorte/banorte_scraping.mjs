// What Casa de Bolsa Banorte sells in shares and exchange-traded funds
// through BeTrading, its online platform (web and app), with no login.
// Banorte prints no list.
//
// The BeTrading page (read 2026-10-28): "Casa de Bolsa Banorte le ofrece
// BeTrading, una plataforma de operación bursátil en línea, a través de la
// cual puede realizar de forma autónoma, operaciones en el Mercado de
// Capitales nacional, internacional (SIC, ETF) y fondos de inversión", "le
// permite invertir directamente en el mercado de capitales nacional e
// internacional". Fees: the Casa de Bolsa's "Guía de Servicios de
// Inversión", Anexo "Comisiones y cargos diversos": "Comisión por operación
// de renta variable / Capitales y obligaciones subordinadas ... Comisión
// calculada por el monto total de la operación ... [comisión máxima] .90%"
// (a ceiling: the cost file takes 0.90%); the optional order-book depth
// service is $700 + IVA a month.
//
// No exchange is named: "Mercado de Capitales nacional" is the country, and
// by the owner's rule a country place with no venue named keeps the
// country's exchanges, the Bolsa Mexicana and BIVA. Each is its whole book
// (owner's rule for a place with no list), read the same way by
// ../actinvertrade/bmvBook.mjs (the BIVA board with { board: "BIVA" }):
// every share, depositary receipt, FIBRA and ETF (ETCs and ETNs too) of the
// local board and the SIC, in pesos. Left out there: CKD and CERPI
// certificates, other trust and mutual-fund certificates, warrants and
// rights, lines never traded on that exchange, Mexican lines with no trade
// there for over a year (suspended or delisted) and SIC lines with no trade
// there for over a year whose home listing is gone. A title on both
// exchanges is one row per exchange. SIC lines open only to qualified
// investors depend on the client: a remark, not a removal.
// broker-list.json gives "BIVA" and "Bolsa Mexicana", the same places.
//
//   https://www.banorte.com/Casa-de-Bolsa/BeTrading/Que-es-BeTrading.html
//   https://www.banorte.com/dam/jcr:78a73e27-f480-4ee3-b0fa-7d5ed0fb0d97/Gu%C3%ADa%20de%20Servicios%20de%20Inversi%C3%B3n%20Casa%20de%20Bolsa.pdf   (fees)
//
//   node brokers/banorte/banorte_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";

await pageSays("https://www.banorte.com/Casa-de-Bolsa/BeTrading/Que-es-BeTrading.html", [
  /plataforma de operación bursátil en línea/,
  /operaciones en el Mercado de Capitales nacional, internacional \(SIC, ETF\)/,
]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const guide = await fetch("https://www.banorte.com/dam/jcr:78a73e27-f480-4ee3-b0fa-7d5ed0fb0d97/Gu%C3%ADa%20de%20Servicios%20de%20Inversi%C3%B3n%20Casa%20de%20Bolsa.pdf", { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
if (!guide.ok || !Buffer.from(await guide.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF-")) throw new Error(`the Banorte investment-services guide is no longer served (${guide.status})`);

const bmv = await bmvBook();
const biva = await bmvBook({ board: "BIVA" });
const rows = stampRows(withoutObligations([...bmv.rows, ...biva.rows].filter((row) => row.type !== "FUND")));
for (const [mic, ticker] of [["XMEX", "GFNORTE/O"], ["XMEX", "AAPL"], ["XMEX", "NAFTRAC/ISHRS"], ["BIVA", "WALMEX"], ["BIVA", "AAPL"]]) {
  if (!rows.some((row) => row.mic === mic && row.ticker === ticker)) throw new Error(`${mic} ${ticker} is missing`);
}
fs.writeFileSync(new URL("banorte-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`BMV: dropped ${bmv.dropped.length}, quiet SIC kept ${bmv.quiet.length}; BIVA: dropped ${biva.dropped.length}, quiet SIC kept ${biva.quiet.length}`);
