// What Kuspit sells in shares and exchange-traded funds, with no login.
// Kuspit Casa de Bolsa is an online Mexican broker. Its pages say clients can
// "Invertir en Acciones Nacionales e Internacionales, Fondos, ETFs" and that
// its capital-market portfolio holds "Acciones, ETFs, Fibras". Its own
// instrument catalogue (OpenKuspit mercados/mercadosCapitales) answers only
// with a logged-in bearer token, so the book is the whole Bolsa Mexicana de
// Valores: the local board and the Sistema Internacional de Cotizaciones
// (SIC) foreign lines, shares, FIBRAs and ETFs, all quoted in pesos. No page
// names BIVA, so no BIVA rows.
// The book is read by ../actinvertrade/bmvBook.mjs, shared with the other
// BMV-only brokers. It leaves out CKD and CERPI certificates, other trust and
// mutual-fund certificates, warrants and rights, lines that never traded,
// Mexican lines with no trade for over a year (suspended or delisted) and SIC
// lines with no BMV trade for over a year whose home listing is gone. See
// that file for the details.
// No Kuspit page excludes a board, segment, ETFs or SIC lines. Some SIC lines
// are open only to qualified investors under CNBV rules: that depends on the
// client, so it is a remark, not a removal.
//
// Fees (no login): "Mercado de capitales = 0.20% por operación", footer item
// "Comisiones" (id 7) of kuspit.com:
//   https://kuspit.com/
//   https://ok2.kuspit.com/OpenKuspit/api/k2/generales/footer   (ids 7, 8, 9)
//
//   node brokers/kuspit/kuspit_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "../actinvertrade/bmvBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet } = await bmvBook();
const out = stampRows(withoutObligations(rows));
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) {
  if (!out.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Kuspit catalogue`);
}
fs.writeFileSync(new URL("kuspit-parsed.json", import.meta.url), JSON.stringify(out, null, 2));
const count = {};
for (const row of out) count[row.type] = (count[row.type] || 0) + 1;
console.error(`kuspit: ${out.length} rows ${JSON.stringify(count)}; dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);
