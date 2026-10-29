// What VINVER (Versátil Inversiones y Transacciones S.A., Córdoba, ALyC
// n° 348 CNV) sells in Buenos Aires shares and CEDEARs, with no login.
// Clients open an account and trade online in its app (app.vinver.com.ar,
// "Operar"); the home page sells "CEDEARS", "Dólar MEP y Cable" and
// "Acciones". It publishes no list and names no restriction.
//
//   https://vinver.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs (CEDEARs of US ETFs included; block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines left out there). Cable (C) lines are kept: the home page sells
// "Dólar MEP y Cable" and the tariff prices transfers of securities to and
// from DTC / Euroclear.
//
// Fees ("Tabla de comisiones y gastos", 2021-08-19, plus IVA): the share
// line (market rights 0,08% BYMA / 0,20% MAV) reads "ARANCEL ESTANDAR
// 1,00% ARANCEL ONLINE 0,50% ARANCEL MINIMO 0,50% MINIMO $ 25"; "La
// operatoria Offline puede tener recargas":
//   https://vinver.com.ar/wp-content/uploads/2021/08/2021-08-19_VINVER-Comisiones-y-Aranceles.pdf
//
//   node brokers/vinver/vinver_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://vinver.com.ar/", [/D[oó]lar MEP y Cable/, /Comisiones y Aranceles/]);
await pdf("https://vinver.com.ar/wp-content/uploads/2021/08/2021-08-19_VINVER-Comisiones-y-Aranceles.pdf");

const { rows } = await bymaBook("Vinver", { cable: true });
if (rows.length < 500) throw new Error(`only ${rows.length} BYMA lines`);
fs.writeFileSync(new URL("vinver-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Vinver: ${rows.length} BYMA lines (cable lines kept)`);
