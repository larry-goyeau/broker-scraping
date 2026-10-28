// What Mills Capital (Mills Capital Markets S.A., ALyC y AN Propio n° 249
// CNV, Buenos Aires) sells in Buenos Aires shares and CEDEARs, with no
// login. The broker publishes no list of its own. Its "Inversiones &
// Trading" page names the instruments it trades, "Acciones y CEDEARs" and
// "Dólar MEP / CCL" among them, with no restricted list:
//
//   https://mills.capital/servicios/inversion-financiera/
//   "Operamos sobre un universo amplio de instrumentos ... Acciones y
//   CEDEARs, Bonos corporativos, Cauciones bursátiles, ... Dólar MEP / CCL,
//   ... Títulos públicos"
//
// So the catalogue is BYMA's whole share and CEDEAR board (CEDEARs of US
// ETFs such as SPY and QQQ included), read by ../bancogalicia/bymaBook.mjs:
// the peso, MEP-dollar (D) and cable (C) lines of every local share and
// CEDEAR that BYMA quotes and that traded in the last months; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out there. Cable lines are kept because the broker trades
// "Dólar MEP / CCL" (CCL is the cable dollar) and its fee schedule charges
// "Transferencias internacionales a depositarias en el Exterior". Bonds,
// letras, ONs, options and cauciones are other products.
//
// Fees ("Comisiones, aranceles y gastos – anexo B"): "Compra / Venta
// Acciones" up to 3%, minimum 0.35% + IVA, plus BYMA market rights;
// custody at Caja de Valores 0.50%:
//   https://mills-storage.nyc3.cdn.digitaloceanspaces.com/media/documents/MCM_Comisiones.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/mills/mills_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Mills Capital", { cable: true });
fs.writeFileSync(new URL("mills-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Mills Capital: ${rows.length} rows`);
