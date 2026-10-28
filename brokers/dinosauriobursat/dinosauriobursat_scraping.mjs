// What Dinosaurio Bursátil (Paez Bursátil; "Agente de Liquidación y
// Compensación Propio inscripto en la Comisión Nacional de Valores con el
// número 235. Somos el agente BYMA número 168") sells in Buenos Aires shares
// and CEDEARs, with no login. Its only place is BYMA (BCBA / XBUE).
//
// The broker's pages, read 2026-10-25:
//   https://www.dinosauriobursatil.com.ar/productos/acciones
//   "Invertí en acciones de las mayores empresas a nivel nacional", orders
//   "a través del HomeBroker o por WhatsApp"; the cards below ("Empresas en
//   las que podés invertir": Banco Francés, Galicia, YPF, Pampa...) are
//   examples, not a closed list.
//   https://www.dinosauriobursatil.com.ar/productos/cedears
//   CEDEARs "Cotizan en pesos o dólares"; "Algunas de las empresas que
//   podés adquirir" (examples again); its FAQ covers "CEDEARs de ETF".
//   https://www.dinosauriobursatil.com.ar/productos/dolar-mep
//   Dollars are bought as MEP ("Dólar MEP Cerrado" or the bond route).
// No page names a board, a segment or a kind of share or CEDEAR it does
// not trade, so the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs: local shares and CEDEARs, ETF CEDEARs
// included, that trade; block lines, closed-end funds, rights, warrants,
// bond CEDEARs and dormant lines left out), with the peso line and the
// MEP-dollar (D) line of each title.
// Cable (C) lines are not written: the product list offers the MEP dollar
// only, and the fee table has no cable / CCL line. The site names
// "Contado con Liquidación" only to explain CEDEAR prices and, on the MEP
// page, as something that "Requiere una cuenta bancaria en el extranjero".
//
// Fees ("Tarifario de Comisiones"): "Acciones" and "Cedears" 0.40% + IVA by
// web, 1% (máx) + IVA by desk; 50% off intraday trades on the web; no
// account fees:
//   https://www.dinosauriobursatil.com.ar/comisiones
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/dinosauriobursat/dinosauriobursat_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Dinosaurio Bursátil", { cable: false });
console.error(`Dinosaurio Bursátil: ${rows.length} rows`);
fs.writeFileSync(new URL("dinosauriobursat-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
