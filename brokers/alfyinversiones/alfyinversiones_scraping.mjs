// What Alfy Inversiones (Alfy Inversiones S.A., "Agente de Liquidación y
// Compensación Propio N°176 CNV", Buenos Aires) sells in Buenos Aires
// shares and CEDEARs, with no login. Its only place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-25:
//   https://alfyinversiones.com.ar/opera/acciones/
//   "Comprá acciones y participá en las ganancias de empresas que cotizan en
//   bolsa. Invertí 100% online"; "las acciones se negocian principalmente
//   en pesos, aunque también es posible operarlas en dólares".
//   https://alfyinversiones.com.ar/opera/cedears/
//   CEDEARs "En pesos y en dólares, desde tu cuenta local", ETF certificates
//   included ("Conocé todos los ETFs disponibles a través de CEDEARs").
//   https://alfyinversiones.com.ar/opera/etfs/
//   CEDEARs of ETFs "Se operan en pesos o en dólares MEP"; the page lists
//   SPY, QQQ, DIA ... as examples, not as a closed list.
//
// No list, panel or kind of share is left out, so the catalogue is BYMA's
// whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs: the
// leader and general panels and every CEDEAR (ETF certificates included),
// each with its peso line, its MEP-dollar (D) line and its cable (C) line.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and lines
// with no trade in months are left out by that module.
//
// Cable lines are kept: the dollar page says "Si necesitás dólares en una
// cuenta fuera del país, la operación se llama dólar cable o contado con
// liquidación (CCL) y también podés hacerla en Alfy", and CEDEAR dividends
// "se abonan en dólar cable".
//   https://alfyinversiones.com.ar/opera/dolar-mep/
// Bonds, letras, ONs, options, futures and funds are other products.
//
// Fees ("Aranceles", web channel): "Acciones 0,40% $200", "Cedears 0,40%
// $200" (minimum), market fees on top in the full fee table:
//   https://alfyinversiones.com.ar/regulaciones-y-aranceles/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/alfyinversiones/alfyinversiones_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Alfy Inversiones", { cable: true });
fs.writeFileSync(new URL("alfyinversiones-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Alfy Inversiones: ${rows.length} rows`);
