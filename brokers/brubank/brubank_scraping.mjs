// What Brubank (Brubank S.A.U., a digital bank) sells in Buenos Aires
// shares and CEDEARs, with no login. Orders are placed in the Brubank app
// and executed by Balanz Capital Valores S.A.U. (ALyC Integral), where the
// app opens a linked comitente account. Its only place is BYMA (BCBA /
// XBUE), the one Argentine market with a share segment.
//
// Its pages, read 2026-10-28: CEDEARs, "Invertí con tus pesos en empresas
// mundiales, sin tener que abrir una cuenta en el exterior" (the help
// centre's collection is "CEDEARs y ETFs"; "Tenemos 13 nuevos CEDEARs",
// 19/05/2026); "Acciones Argentinas": "Podés ser accionista de empresas
// argentinas cotizadas, desde tu cuenta en pesos". No list of either is
// published, so the owner's rule for a place with no list applies. Fees:
// "El gasto por cada compra de CEDEARs es de hasta 0,6%" and "El gasto por
// cada venta de CEDEARs es de hasta 0,6%" (help centre). No rate is
// published for Argentine shares (only a September 2025 promotion that
// bonified their buy commission), so their cost can only be the CEDEAR
// ceiling or none.
//   https://www.brubank.com/cedears
//   https://www.brubank.com/accionesargentinas
//   https://help.brubank.com/es/articles/8725630-tiene-algun-gasto-incluido   (buy)
//   https://help.brubank.com/es/articles/8725643-tiene-algun-gasto-incluido   (sell)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, bond CEDEARs
// and dormant lines left out there), peso lines only: both pages sell in
// pesos, from the peso account, so the MEP-dollar (D) and cable (C) lines
// are not written. broker-list.json gives the place "Argentina".
//
//   node brokers/brubank/brubank_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://help.brubank.com/es/articles/8725630-tiene-algun-gasto-incluido", [/El gasto por cada compra de CEDEARs es de hasta 0,6%/]);
await evidence("https://help.brubank.com/es/articles/8725643-tiene-algun-gasto-incluido", [/El gasto por cada venta de CEDEARs es de hasta 0,6%/]);
await evidence("https://www.brubank.com/accionesargentinas", [/Podés ser accionista de empresas argentinas cotizadas, desde tu cuenta en pesos/]);
await evidence("https://www.brubank.com/cedears", [/Invertí con tus pesos en empresas mundiales/]);

const { rows: board } = await bymaBook("Brubank", { cable: false });
const rows = board.filter((row) => row.currency === "ARS");
for (const ticker of ["GGAL", "YPFD", "AAPL", "SPY"]) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing`);
console.error(`Brubank: ${rows.length} peso rows; ${board.length - rows.length} dollar lines left out`);
fs.writeFileSync(new URL("brubank-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
