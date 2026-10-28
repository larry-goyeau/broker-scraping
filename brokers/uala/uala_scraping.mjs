// What Ualá (Ualá Inversiones S.A.U., formerly Ualintec Capital, ALyC
// Integral no. 1283 at the CNV and BYMA member no. 161) sells in Buenos
// Aires shares and CEDEARs, with no login. Orders go through the Ualá app;
// the only place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-25:
//   https://www.uala.com.ar/inversiones/acciones-bonos-cedears
//   "CEDEARs: certificados que representan acciones o ETF del exterior;
//   podés comprarlos y venderlos en el mercado argentino." "Acciones: renta
//   variable que representa parte del capital de una empresa; cotizan en
//   pesos." CEDEARs "te permiten comprar en pesos una pequeña partecita de
//   una empresa que cotiza en dólares". ETFs are listed among the CEDEARs.
//   https://www.ualainversiones.com.ar/faqs
//   "Los CEDEARs ... representan acciones de empresas o ETFs que cotizan en
//   mercados del exterior." Dollars are bought as "Dólar MEP" through the
//   bond AL30 and kept in the Ualá dollar savings account.
//
// No list of its own and no excluded board, so the catalogue is BYMA's
// whole share and CEDEAR board (../bancogalicia/bymaBook.mjs: local shares
// and CEDEARs, ETF CEDEARs included, that trade; block lines, closed-end
// funds, rights, bond CEDEARs and dormant lines left out). Only the peso
// lines are written: the pages describe shares and CEDEARs as quoted and
// bought in pesos, and the fee page prices "Títulos Públicos en pesos y en
// dólares" but "Títulos Privados" with no dollar side; the MEP (D) and
// cable (C) dollar lines of shares and CEDEARs are not offered anywhere on
// its pages.
//
// Fees ("Nuestras comisiones"): "Compra/Venta de Títulos Privados Hasta 1%
// + IVA"; the FAQ: "La comisión de Compra/Venta de Títulos Privados
// corresponde a CEDEARs":
//   https://www.ualainversiones.com.ar/comisiones (was www.ualintec.com.ar/comisiones)
//
//   node brokers/uala/uala_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows: board } = await bymaBook("Ualá", { cable: false });
const rows = board.filter((row) => row.currency === "ARS");
console.error(`Ualá: ${rows.length} peso rows; ${board.length - rows.length} MEP dollar lines left out`);
fs.writeFileSync(new URL("uala-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
