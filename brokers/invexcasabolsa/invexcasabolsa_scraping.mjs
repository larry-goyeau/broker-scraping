// What INVEX Casa de Bolsa sells in shares and exchange-traded funds, with
// no login. Its private-banking page offers "Mercado accionario: compra de
// acciones que cotizan en la Bolsa Mexicana de Valores o del Sistema
// Internacional de Cotizaciones (SIC)", and its SMART and Patrimonial
// services give the self-directed INVEX Trade platform with "Mercado de
// Capitales". It publishes no list of its own, so the book is the whole
// Bolsa Mexicana de Valores: the local board and the SIC foreign lines,
// shares, FIBRAs and ETFs (all shares of the exchange, ETFs included), all
// quoted in pesos. No page names BIVA, so no BIVA rows. Shares bought through
// INVEX's Miami broker-dealer (invex.us) are another firm and are not here.
// The book is read by ../actinvertrade/bmvBook.mjs, shared with the other
// BMV-only brokers. It leaves out CKD and CERPI certificates, other trust and
// mutual-fund certificates, warrants (INVEX sells them, but they are not
// shares) and rights, lines that never traded, Mexican lines with no trade
// for over a year (suspended or delisted) and SIC lines with no BMV trade for
// over a year whose home listing is gone. See that file for the details.
// No INVEX page excludes a board, segment, ETFs or SIC lines. Some SIC lines
// are open only to qualified investors under CNBV rules, and the services
// have minimum balances (SMART MXN 500,000): both depend on the client, so
// they are remarks, not removals.
//
// Fees (no login): Casa de Bolsa, "Compra /Venta de acciones 1.00% + IVA Por
// operación", plus custody and yearly fees:
//   https://invex.com/costos-y-comisiones
//   https://invex.com/personas/privada
//   https://invex.com/personas/banca-patrimonial
//
//   node brokers/invexcasabolsa/invexcasabolsa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet } = await bmvBook();
const out = stampRows(withoutObligations(rows));
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) {
  if (!out.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the INVEX catalogue`);
}
fs.writeFileSync(new URL("invexcasabolsa-parsed.json", import.meta.url), JSON.stringify(out, null, 2));
const count = {};
for (const row of out) count[row.type] = (count[row.type] || 0) + 1;
console.error(`invexcasabolsa: ${out.length} rows ${JSON.stringify(count)}; dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);
