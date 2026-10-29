// What Adcap (Adcap Securities Argentina S.A., ALyC Integral at the CNV)
// sells in Buenos Aires shares and CEDEARs, with no login. Its only place is
// BYMA (BCBA / XBUE).
//
// Its pages, read 2026-10-28: the Adcap app, "Accedé al Mercado de
// Capitales desde tu celular. Operá fondos, bonos, acciones y más", and its
// platform for wallets "Permite operar acciones, bonos, CEDEARs, FCI y
// dólar MEP, entre otros". The fee table ("Tabla de aranceles y
// comisiones") prices "Renta Variable: Acciones U$S/$ 3,00%" and "CEDEAR
// (Certificado de Depósito Argentino) 3,00%", plus IVA and market fees. It
// publishes no list and names no excluded board.
//   https://www.ad-cap.com.ar/soluciones
//   https://www.ad-cap.com.ar/legales
//   https://cdn.ad-cap.com.ar/adcap-web/pdf/aranceles-y-comisiones.pdf   (fees)
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: local shares and CEDEARs (ETF CEDEARs
// included) that trade, each with its peso line and its MEP-dollar (D)
// line; block lines, closed-end funds, rights, bond CEDEARs and dormant
// lines are left out there. Cable (C) lines are not written: the pages and
// the fee table name the MEP dollar and no cable / CCL settlement.
// broker-list.json gives "BYMA".
//
//   node brokers/adcap/adcap_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.ad-cap.com.ar/soluciones", [/Operá fondos, bonos, acciones y más/, /acciones, bonos, CEDEARs, FCI y dólar MEP/]);
await evidence("https://www.ad-cap.com.ar/legales", [/Tabla de aranceles y comisiones/, /aranceles-y-comisiones\.pdf/]);
await pdf("https://cdn.ad-cap.com.ar/adcap-web/pdf/aranceles-y-comisiones.pdf");

const { rows } = await bymaBook("Adcap", { cable: false });
console.error(`Adcap: ${rows.length} rows`);
fs.writeFileSync(new URL("adcap-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
