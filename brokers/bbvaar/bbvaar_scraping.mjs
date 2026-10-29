// What BBVA Argentina (Banco BBVA Argentina S.A.) sells in Buenos Aires
// shares online, with no login. Its only place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-28: "Mercado de Capitales ... Acciones:
// Diversificá tus inversiones ... Comisión compra y venta de Acciones:
// 1,0951% sobre el valor de la operación"; the Acciones page: "Contratación
// A través de Banca Online. También podés contactarte con algunos de
// nuestros representantes en nuestras sucursales, o telefónicamente"; the
// fee table (personas): "Operaciones a través de la Bolsa - Compra / Venta
// de acciones (sobre el valor monetario de la operación) 1,0588 %"
// (before tax). It publishes no list and names no excluded board.
//   https://www.bbva.com.ar/personas/productos/inversiones/mercado-capitales.html   (fee)
//   https://www.bbva.com.ar/personas/productos/inversiones/mercado-capitales/acciones.html
//   https://www.bbva.com.ar/tablas/comision.pdf   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board (the owner's rule
// for a place sold with no list; CEDEARs and ETF CEDEARs trade on the same
// BYMA equity board, though no BBVA page names them), read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs that trade, each
// with its peso line and its MEP-dollar (D) line; block lines, closed-end
// funds, rights, bond CEDEARs and dormant lines are left out there. Cable
// (C) lines are not written: no page names a cable / CCL settlement.
// broker-list.json gives "BYMA".
//
//   node brokers/bbvaar/bbvaar_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.bbva.com.ar/personas/productos/inversiones/mercado-capitales.html", [/Comisión compra y venta de Acciones: 1,0951% sobre el valor de la operación/]);
await evidence("https://www.bbva.com.ar/personas/productos/inversiones/mercado-capitales/acciones.html", [/Contratación A través de Banca Online/]);
await pdf("https://www.bbva.com.ar/tablas/comision.pdf");

const { rows } = await bymaBook("BBVA Argentina", { cable: false });
console.error(`BBVA Argentina: ${rows.length} rows`);
fs.writeFileSync(new URL("bbvaar-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
