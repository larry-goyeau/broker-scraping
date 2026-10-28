// What Buenos Aires Valores (BAVSA, "ALyC y AN Integral N° 497/CNV") sells
// in Buenos Aires shares and CEDEARs, with no login. Its client platform
// manual (clientes.bavsa.com, version 1.0, February 2026) lists what the
// platform trades: "Compra y venta de acciones, CEDEARs y bonos", with the
// market screen split into "Acciones (Lider)" ("Acciones del panel lider del
// mercado argentino"), "Acciones (General)" ("Acciones del panel general")
// and "CEDEARs" ("Certificados de depósito argentinos que representan
// acciones extranjeras"), next to bonds, letras, ONs, cauciones and funds.
//   https://clientes.bavsa.com/manualUsuario.html
//
// It names no list of its own and leaves no panel out, so the catalogue is
// BYMA's whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs:
// the leader and general panels, every CEDEAR (ETF certificates such as SPY
// and QQQ included), each with its peso line and its MEP-dollar (D) line.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and lines
// with no trade in months are left out by that module.
//
// Cable (C) lines are not written. The platform's currency filter is "ARS /
// MEP" ("Pesos o dólares") and the order form offers "ARS (pesos) o USD
// (dólares)" with the MEP dollar as the only dollar named. The fee schedule
// does carry "Liquidaciones en Dólar Cable (por transacción) U$D 50" and
// "Conversión de dólar 7000 a cable", but no online path to trade the cable
// lines is shown, and the site lists only what can be bought online.
// Bonds, letras, ONs, options and funds are other products.
//
// Fees ("Compra / Venta de Acciones" from 0.01% to 2.00%, plus VAT and BYMA
// market fees; "Mantenimiento de Cuenta (mensual)" AR$ 60):
//   https://www.bavsa.com/assets/aranceles/1764853082_arances-p-pagina-webpdf.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/buenosairesvalor/buenosairesvalor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Buenos Aires Valores", { cable: false });
fs.writeFileSync(new URL("buenosairesvalor-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Buenos Aires Valores: ${rows.length} rows`);
