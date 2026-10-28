// What Dracma Investments (Dracma S.A., "Agente de Bolsas y Mercados
// Argentinos (BYMA) inscripto bajo el N° 184", ALyC n° 238 CNV) sells in
// Buenos Aires shares and CEDEARs, with no login. Its app's store page lists
// the instruments it trades: "Acciones, bonos, O.N.s, letras y opciones del
// mercado argentino", "Compra y venta de Dólar MEP" and "CEDEARs (empresas
// como Apple, Amazon, Google, entre otras)". Its equity page presents
// Acciones, ADR and CEDEAR ("Podrás invertir en Apple, Coca-Cola, Google y
// muchísimas más").
//   https://play.google.com/store/apps/details?id=ar.com.dracmainv.app
//   https://dracmainv.com.ar/instrumentos/renta-variable/
//
// It names no list of its own and leaves no panel out, so the catalogue is
// BYMA's whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs:
// every local share and CEDEAR (ETF certificates such as SPY and QQQ
// included), each with its peso line and its MEP-dollar (D) line. ADRs trade
// abroad and are not BYMA lines. Block lines, closed-end funds, bond
// CEDEARs, rights, warrants and lines with no trade in months are left out
// by that module.
//
// Cable (C) lines are not written. The app names the MEP dollar as its only
// dollar trade; the external dollar ("Solicitud de conversión de Dólar Ext.
// a Dolar Local", "PAGO EXTERIOR - DÓLAR EXT") is handled by request forms,
// and the fee table has no cable trading line. Bonds, letras, ONs, options
// and funds are other products.
//
// Fees ("Compra-Venta de acciones (1) 1% + IVA + 0,08% Derechos de Mercado",
// minimum "$1000 o u$2", as "COMISIÓN MÁXIMA POR OPERACIÓN"; intraday round
// trips 50% off; "Mantenimiento de cuentas $2000 + IVA"):
//   https://dracmainv.com.ar/como-comenzar/tabla-de-comisiones/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/dracma/dracma_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Dracma Investments", { cable: false });
fs.writeFileSync(new URL("dracma-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Dracma Investments: ${rows.length} rows`);
