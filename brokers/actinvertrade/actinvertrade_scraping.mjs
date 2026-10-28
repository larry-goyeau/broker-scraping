// What Actinver Trade (formerly Bursanet) sells in shares and exchange-traded
// funds, with no login. Actinver Trade is the self-directed online account of
// Actinver Casa de Bolsa. Its FAQ says the account gives access to "Acciones
// de empresas nacionales e internacionales (SIC), FIBRAs, ETFs locales y
// globales", and its investment-services guide lists for Actinver Trade
// "Mercado de capitales: acciones BMV, SIC, ETFs". It publishes no list of
// its own, so the book is the whole Bolsa Mexicana de Valores: the local
// board and the Sistema Internacional de Cotizaciones (SIC) foreign lines,
// shares, FIBRAs and ETFs, all quoted in pesos. No page names BIVA, so no
// BIVA rows.
// The book is read by ../actinvertrade/bmvBook.mjs, shared with the other
// BMV-only brokers. It leaves out CKD and CERPI certificates, other trust and
// mutual-fund certificates, warrants and rights, lines that never traded,
// Mexican lines with no trade for over a year (suspended or delisted) and SIC
// lines with no BMV trade for over a year whose home listing is gone. See
// that file for the details.
// No Actinver Trade page excludes a board, segment, ETFs or SIC lines. Some
// SIC lines are open only to qualified investors under CNBV rules: that
// depends on the client, so it is a remark, not a removal.
//
// Fees (no login): "Inversiones 0.10% al 0.25%", by the client's 30-day
// equity volume, plus IVA, section 6.4 of the guide:
//   https://www.actinver.com/documents/74160/1977463/Bursanet+Guia+de+Servicios+de+Inversion.pdf/4097c6f2-a595-66b1-0769-0fc022098121?t=1636472018991
//   https://actinvertrade.actinver.com/preguntas-frecuentes.html
//   https://actinvertrade.actinver.com/beneficios.html
//
//   node brokers/actinvertrade/actinvertrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bmvBook } from "./bmvBook.mjs";
import fs from "node:fs";

const { rows, dropped, quiet } = await bmvBook();
const out = stampRows(withoutObligations(rows));
for (const ticker of ["WALMEX", "FUNO/11", "AAPL", "NAFTRAC/ISHRS"]) {
  if (!out.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Actinver Trade catalogue`);
}
fs.writeFileSync(new URL("actinvertrade-parsed.json", import.meta.url), JSON.stringify(out, null, 2));
const count = {};
for (const row of out) count[row.type] = (count[row.type] || 0) + 1;
console.error(`actinvertrade: ${out.length} rows ${JSON.stringify(count)}; dropped ${dropped.length}, quiet SIC kept ${quiet.length}`);
