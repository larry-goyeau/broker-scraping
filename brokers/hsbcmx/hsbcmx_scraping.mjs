// What HSBC México sells in shares and exchange-traded funds through HSBC
// eTrading (its online investment portal), with no login. It prints no
// list.
//
// The eTrading page (read 2026-10-28) lists "Compra-venta de Fondos y
// Capitales", "Búsqueda y comparación de emisoras". The bank's contract
// for its electronic services, "Operaciones de Compra Venta de Acciones":
// "Este es un servicio proporcionado a través de Medios Electrónicos
// (Internet)", "El canal solo permitirá invertir en acciones colocadas en
// la Bolsa Mexicana de Valores, no pudiendo invertir en acciones del Sistema
// Internacional de Cotizaciones ("SIC")", and buys above $1,000,000 a day go
// "por la vía tradicional" (branch or phone). Fees: the investment
// commission annex, "MERCADO DE CAPITALES - COMISIONES DIRECTAS: Corretaje
// 1.00% (Por operación)", custody 0.0125%, online market data $200 a month
// (the wealth and sophisticated-investor annexes print 1.70%).
//
// So the catalogue is the Bolsa Mexicana's local board: the lines of the
// BMV book (../actinvertrade/bmvBook.mjs) with a Mexican ISIN, i.e. shares,
// FIBRAs and Mexican ETFs (an exchange's shares include its ETFs, owner's
// rule), in pesos; the SIC lines (foreign ISINs) are left out as the
// contract says. Left out in the book: CKD and CERPI certificates, other
// trust and mutual-fund certificates, warrants and rights, lines that
// never traded and Mexican lines with no trade for over a year (suspended
// or delisted). broker-list.json gives "Bolsa Mexicana" and "BIVA"; no HSBC
// page names BIVA and the contract names only the Bolsa Mexicana, so there
// are no BIVA rows.
//
//   https://www.hsbc.com.mx/digital/hsbc-etrading/
//   https://www.hsbc.com.mx/content/dam/hsbc/mx/documents/contrato/contrato_anexo.pdf   (channel rules)
//   https://www.hsbc.com.mx/content/dam/hsbc/mx/documents/inversiones/anexo_comisiones.pdf   (fees)
//
//   node brokers/hsbcmx/hsbcmx_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";

await pageSays("https://www.hsbc.com.mx/digital/hsbc-etrading/", [/Compra-venta de Fondos y Capitales/]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
for (const url of [
  "https://www.hsbc.com.mx/content/dam/hsbc/mx/documents/contrato/contrato_anexo.pdf",
  "https://www.hsbc.com.mx/content/dam/hsbc/mx/documents/inversiones/anexo_comisiones.pdf",
]) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString().startsWith("%PDF-")) throw new Error(`${url} is no longer served (${response.status})`);
}

const { rows: book, dropped } = await bmvBook();
const local = book.filter((row) => row.isin.startsWith("MX") && row.type !== "FUND");
const rows = stampRows(withoutObligations(local));
for (const ticker of ["WALMEX", "FUNO/11", "NAFTRAC/ISHRS"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the HSBC catalogue`);
}
if (rows.some((row) => row.ticker === "AAPL")) throw new Error("a SIC line was kept");
if (rows.length < 100) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("hsbcmx-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const count = {};
for (const row of rows) count[row.type] = (count[row.type] || 0) + 1;
console.error(`hsbcmx: ${rows.length} rows ${JSON.stringify(count)}; ${book.length - local.length} SIC lines left out; book dropped ${dropped.length}`);
