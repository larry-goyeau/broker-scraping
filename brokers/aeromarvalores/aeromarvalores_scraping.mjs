// What Aeromar Valores S.A. (ALyC y AN Propio n° 171 CNV) sells in Buenos
// Aires shares and CEDEARs, with no login. It publishes no list of its own.
// Its products page names local shares, CEDEARs and ETFs, and its tariff has
// one variable-income column for shares and CEDEARs:
//
//   https://www.aeromarvalores.com.ar/productos.php
//   "ACCIONES", "CEDEARS: ... acciones de empresas no argentinas que cotizan
//   en la Bolsa de Comercio de Buenos Aires", "ETFS".
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso and MEP dollar (D) lines of every
// local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ included)
// that BYMA quotes and that trades. Cable (C) lines are not written: no
// Aeromar page nor its tariff names cable / CCL settlement or dollars held
// abroad. Block lines, closed-end funds, bond CEDEARs, rights, warrants and
// dormant or delisted lines are left out by the shared module (the tariff's
// "Contado Block" rate is for those block lines). Bonds, letras, options,
// cauciones, cheques and loans are other products. No page names a segment,
// board or title the broker does not trade.
//
// Fees ("ARANCELES, Comisiones y Recuperos", in force from 1 July 2026),
// "RENTA VARIABLE - CEDEARS", "Operaciones de Contado": minimum $160, 0,50%
// to 1,00%; custody 0%:
//   https://www.aeromarvalores.com.ar/comisiones.php
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/aeromarvalores/aeromarvalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Aeromar Valores", { cable: false });
fs.writeFileSync(new URL("aeromarvalores-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Aeromar Valores: ${rows.length} BYMA lines`);
