// What ELYCA (Elyca Servicios Globales S.A., Agente de Negociación n° 1148
// CNV, BYMA participant n° 828, MAV member n° 794, Bahía Blanca) sells in
// Buenos Aires shares and CEDEARs, with no login. It publishes no list of
// its own; its home page names shares and CEDEARs among the products:
//
//   https://www.elyca.com.ar/
//   "somos participantes BYMA número 828"; "Renta variable ... Acciones /
//   CEDEAR / Opciones"; "Invertí en Dólar MEP ... Consiste en la compra de
//   un bono en pesos para su posterior venta en dólares."
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso and MEP-dollar (D) lines of every local share and CEDEAR that
// BYMA quotes and that trades; block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out there. Cable
// (C) lines are not written: the site and the tariff name only the MEP
// dollar, and the deposit accounts in its FAQ are Argentine accounts in
// pesos and dollars (Rosario Valores S.A. at Banco Comafi), with no account
// abroad. Bonds, ONs, cauciones, cheques, pagarés, options and funds are
// other products. No page names a segment, board or title it does not trade.
//
// Fees ("Tabla de aranceles máximos", the footer's "Tabla de Aranceles"
// link): "CONTADO TÍTULOS PRIVADOS 1,00% $800" (minimum), plus IVA and the
// market and Caja de Valores fees; account opening and maintenance $0:
//   https://www.elyca.com.ar/PDF/tab_aran_2024.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/elyca/elyca_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("ELYCA", { cable: false });
fs.writeFileSync(new URL("elyca-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`ELYCA: ${rows.length} BYMA lines`);
