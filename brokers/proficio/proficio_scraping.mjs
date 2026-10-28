// What Proficio Investment S.A. ("ALyC AN Propio CNV No. 115 | Agente BYMA
// No. 20") sells in Buenos Aires shares and CEDEARs, with no login. Its
// only place is BYMA (BCBA / XBUE).
//
// The broker's pages, read 2026-10-25:
//   https://proficioinvestment.com/productos-y-servicios/
//   Accounts "Cuenta estándar: Manejá tus inversiones desde tu app o
//   computadora" and "Trading Pro"; "Ponemos a tu disposición plataformas
//   para operar en el mercado local y global desde la app o la web".
//   The fee schedule charges "Compra/Venta de Títulos Privados" (shares and
//   CEDEARs) with BYMA's market rights on top.
// No page names a board, a segment or a kind of share or CEDEAR it does
// not trade, so the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, warrants,
// bond CEDEARs and dormant lines left out), with the peso line, the
// MEP-dollar (D) line and the cable (C) line of each title.
// Cable lines are kept because Proficio holds client dollars and
// securities abroad. Its account agreement (Convenio PH, clause 7): the
// client may order "operaciones en el exterior", executed "a través de un
// bróker de Estados Unidos de Norteamérica", and "autoriza al AGENTE, a
// mantener en custodia los títulos de su propiedad en una cuenta radicada
// en el exterior"; "Las operaciones en el exterior sólo podrán ser
// efectuadas con Dólares Estadounidenses". The fee schedule charges
// "Transferencias a depositarias exteriores USD 35 por especie
// transferida".
//   https://proficioinvestment.com/wp-content/uploads/2025/04/Convenio-PH-v1.6.7-1.pdf
//
// Fees ("Aranceles", "Vigentes desde el 09-10-24"): "Compra/Venta de
// Títulos Privados: 0,6%", "Reducción de Aranceles por compra/venta en el
// día (intraday trading): 50%" (private securities only), plus BYMA market
// rights and IVA:
//   https://proficioinvestment.com/wp-content/uploads/2024/10/Aranceles-Proficio-Investment-Vigencia-OCTUBRE-2024.10.09.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/proficio/proficio_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Proficio Investment", { cable: true });
console.error(`Proficio Investment: ${rows.length} rows`);
fs.writeFileSync(new URL("proficio-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
