// What Banco Ciudad (Banco de la Ciudad de Buenos Aires, "ALYC y AN
// INTEGRAL" no. 108 at the CNV) sells in Buenos Aires shares and CEDEARs,
// with no login. Its only place is BYMA (BCBA / XBUE).
//
// The bank's comitente account terms and fee annex (one public PDF, read
// 2026-10-25) are the only investment page it serves without a login: its
// product pages load from a menu that answers nothing outside the browser.
//   https://www.bancociudad.com.ar/cms/recursos/institucional/carpetarecurso/Informaci%C3%B3n%20al%20Usuario%20Financiero/Apertura_Cuenta_Comitente.pdf
//   "OPERATORIA DE INTERNET": the client may place "todas las operaciones de
//   compra y venta de títulos valores y licitaciones primarias ... on-line a
//   través del sitio www.bancociudad.com.ar ... tanto en moneda local como
//   en moneda extranjera"; the bank acts "en los Mercados", and the client
//   receives BYMA's investor protection code.
//
// The terms name no list, panel or kind of private security that is left
// out, so the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the leader and general panels and every
// CEDEAR (ETF certificates such as SPY and QQQ included), each with its peso
// line and its MEP-dollar (D) line. Block lines, closed-end funds, bond
// CEDEARs, rights, warrants and lines with no trade in months are left out
// by that module.
//
// Cable (C) lines are not written: the terms settle every trade on the
// client's accounts at the bank (the form names a "Caja de Ahorro en
// Pesos", a "Caja de Ahorro en Dólares" and current accounts, and "Las
// transferencias de saldos líquidos ... se acreditarán en la cuenta a la
// vista habilitada"), and the fee annex has a peso and a dollar line but no
// cable, CCL or foreign-transfer line. Bonds, letras and primary auctions
// are other products.
//
// Fees (annex "COMPRA / VENTA DE VALORES MOBILIARIOS", in force from
// 17/09/2025): "Compra/ Venta Títulos Privados 1,00%", plus VAT where due;
// custody of "Privados – Obligaciones Negociables, Acciones" 0,36% a year
// (same PDF as above).
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/bancociudad/bancociudad_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Banco Ciudad", { cable: false });
fs.writeFileSync(new URL("bancociudad-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Banco Ciudad: ${rows.length} rows`);
