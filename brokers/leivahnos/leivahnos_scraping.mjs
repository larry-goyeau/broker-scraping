// What Leiva Hermanos S.A. (ALyC Integral Agroindustrial, CNV matrícula
// n° 630) sells in Buenos Aires shares and CEDEARs, with no login. It
// publishes no list of its own (its share and CEDEAR pages show BYMA's
// board only to account holders). Its investments page names BYMA and its
// menu lists "Acciones" and "CEDEAR":
//
//   https://www.leivahnos.com.ar/home-bursatil/
//   "miembro de los principales mercados de Argentina: Bolsas y Mercados
//   Argentinos (BYMA), Mercado a Término de Buenos Aires S.A y Rofex S.A.
//   (Matba-Rofex); y Mercado Argentino de Valores (MAV)."
//   https://www.leivahnos.com.ar/bur-acciones/
//   https://www.leivahnos.com.ar/bur-cedear/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the fee schedule lets clients move dollars and securities abroad:
// "TRANSFERENCIAS U$S EXTERIOR USD 100" and "TRANSFERENCIA A OTRAS
// DEPOSITARIAS EXTERIORES / CAMBIO DEPOSITANTE USD 150". Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module. Bonds, letras, ONs, options,
// futures, cauciones, cheques and funds are other products. No page names a
// segment, board or title the broker does not trade.
//
// Fees ("Cuadro de aranceles y gastos", in force from 02/06/2026; the
// "COMISIONES Y ARANCELES" link of the site footer, a page that shows one
// image): "ACCIONES" and "CEDEARs" 1% (minimum $1500 / USD 2) through the
// desk, 0.5% (minimum $500 / USD 1) through direct market access (DMA),
// plus BYMA market rights and IVA:
//   https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/
//   https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/aranceles-y-comisiones.jpeg
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/leivahnos/leivahnos_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Leiva Hnos.", { cable: true });
fs.writeFileSync(new URL("leivahnos-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Leiva Hnos.: ${rows.length} BYMA lines`);
