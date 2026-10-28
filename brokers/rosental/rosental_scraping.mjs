// What Rosental (Rosental S.A., "ALyC y AN - Propio Nº 313 de la CNV",
// Rosario) sells in Buenos Aires shares and CEDEARs, with no login. Its
// only place is BYMA (BCBA / XBUE).
//
// Its capital-markets page, read 2026-10-25, offers "Operatoria de acciones
// y derivados" and "Operatoria online a través del sistema Direct Market
// Access (DMA)", and names BYMA among its markets ("BYMA Nº 313"). Its fee
// list charges "Acciones - Compra / Venta", CEDEAR issue and cancellation
// ("Emisión Cedear", "Cancelación Cedear") and dividends on "Acciones en
// pesos" and "Acciones en dólares".
//   https://www.rosental.com/mercado-de-capitales/
//
// No list, panel or kind of share is left out, so the catalogue is BYMA's
// whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs: the
// leader and general panels and every CEDEAR (ETF certificates such as SPY
// and QQQ included), each with its peso line, its MEP-dollar (D) line and
// its cable (C) line. Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and lines with no trade in months are left out by that module.
//
// Cable lines are kept: the fee list has a "MEP / CCL" line and a
// "Transferencia de fondos en Dólares Cable" line (U$D 20), so clients can
// settle and hold dollars abroad. Bonds, options, futures, cauciones,
// cheques and funds are other products.
//
// Fees ("LISTADO DE COMISIONES", September 2026): "Acciones - Compra /
// Venta" 0.80 % + IVA (general), 0.60 % + IVA through DMA; BYMA market fees
// on top:
//   https://www.rosental.com/wp-content/uploads/2026/09/comisiones-sept-26.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/rosental/rosental_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Rosental", { cable: true });
fs.writeFileSync(new URL("rosental-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Rosental: ${rows.length} rows`);
