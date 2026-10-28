// What Fernández Laya S.A. (ALyC y AN Propio n° 118 CNV) sells in Buenos
// Aires shares and CEDEARs, with no login. It publishes no list of its own;
// its pages offer every instrument of the Buenos Aires market, with shares
// and CEDEARs named:
//
//   https://www.fernandezlaya.com.ar/servicios
//   "ofrecemos un servicio eficiente para realizar toda operación con un
//   instrumento habilitado en el Mercado de Valores de Buenos Aires."
//   https://www.fernandezlaya.com.ar/
//   "INVERTÍ EN ACCIONES ARGENTINAS Y BONOS"; "INVERTÍ EN CEDEAR";
//   CEDEARs "Se pueden comprar a través de BYMA en pesos".
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that trades; block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out there. US and
// European markets "a través de mandato" are not this place. Cable (C)
// lines are not written: the tariff names "Transferencias de especies al
// exterior" (securities) and "Transferencias Bancaria emisora en dólares",
// but no cable / CCL settlement or dollar account abroad. No page names a
// segment, board or title it does not trade.
//
// Fees ("Tabla de Comisiones", the footer's "Aranceles" link, Nov. 2025):
// "Acciones, Cedears Cpra /Vta 1,00 %", minimum "$ 100", plus market fees
// and IVA; account maintenance $ 2500; custody passes the Caja de Valores
// charge on (minimum $ 50 a month):
//   https://www.fernandezlaya.com.ar/downloads/hoja-de-aranceles-actualizada-noviembre-2025-2662.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/fernandezlaya/fernandezlaya_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Fernández Laya", { cable: false });
fs.writeFileSync(new URL("fernandezlaya-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Fernández Laya: ${rows.length} BYMA lines`);
