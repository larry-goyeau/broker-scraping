// What AG Valores S.A. (ALyC y AN Propio n° 141 CNV, ACyD n° 101; BYMA,
// Rofex and MAV agent) sells in Buenos Aires shares and CEDEARs, with no
// login. It publishes no list of its own. Its home and services pages name
// local and foreign shares, CEDEARs and MEP dollars:
//
//   https://agvalores.com.ar/
//   "Operá con AG Valores: Dólar mep, acciones, bonos, cedears, cauciones,
//   opciones y fondos comunes de inversión"; "opera como agente de BYMA,
//   ROFEX y MAV".
//   https://agvalores.com.ar/servicios
//   "Trading de acciones Locales e internacionales".
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: the
// broker names only "Dólar mep", and its tariff's only foreign line moves
// securities ("Transferencias Depositarias del Exterior"), not cable / CCL
// dollars. Block lines, closed-end funds, bond CEDEARs, rights, warrants and
// dormant or delisted lines are left out by the shared module. Bonds, ONs,
// options, futures, cauciones, cheques and funds are other products. No page
// names a segment, board or title the broker does not trade.
//
// Fees ("ANEXO I – Aranceles y Comisiones", linked from its "Aranceles"
// page): "Acciones Locales" and "Acciones Exterior" minimum $0 – 100, up to
// 1,5%, plus market rights and IVA; custody $900 a month plus Caja de
// Valores costs above the minimum:
//   https://agvalores.com.ar/assets/Pdf/ANEXO-I.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/valoresar/valoresar_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("AG Valores", { cable: false });
fs.writeFileSync(new URL("valoresar-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`AG Valores: ${rows.length} BYMA lines`);
