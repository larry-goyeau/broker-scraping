// What ICBC Argentina (Industrial and Commercial Bank of China (Argentina)
// S.A.U., ALyC y AN Integral no. 74 at the CNV) sells in Buenos Aires
// shares, with no login. Its only place is BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-25:
//   https://www.icbc.com.ar/personas/productos-servicios/inversiones/acciones-titulos
//   "ICBC te brinda la posibilidad de conformar tu propia cartera de
//   inversión, accediendo a múltiples opciones del mercado bursátil y
//   extrabursátil"; "Realizá compras y ventas online ... desde ICBC Online
//   Banking y ICBC Mobile Banking"; "Los montos de tus transacciones, en
//   pesos o en dólares, se acreditan de forma online en tus cuentas"; online
//   orders "Desde la lista del instrumento de tu interés, elegí entre las
//   especies disponibles". The FAQ explains BYMA as the exchange its agents
//   trade on.
// The pages name shares, government bonds, letters and auctions; they
// neither name nor exclude CEDEARs or ETFs, and publish no list of their
// own. So the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, bond
// CEDEARs and dormant lines left out), with the peso line and the
// MEP-dollar (D) line of each title. Cable (C) lines are not written: no
// page or fee line names cable / CCL settlement; dollars are credited to the
// client's local accounts.
//
// Fees ("Catálogo de Comisiones", OPTATA07, in force 09/2025): BYMA
// "Compra/Venta de Acciones" ICBC commission 0,70%, market rights 0,08%,
// total 0,78%, before taxes; custody 0.09% a year (0.06% over $1,000,000),
// minimum $180 a month:
//   https://www.icbc.com.ar/form/OPTATA07.pdf
//
//   node brokers/icbcar/icbcar_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("ICBC Argentina", { cable: false });
console.error(`ICBC Argentina: ${rows.length} rows`);
fs.writeFileSync(new URL("icbcar-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
