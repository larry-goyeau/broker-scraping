// What Gorostiaga Bursátil (Agente de Negociación no. 1636 at the CNV)
// sells in Buenos Aires shares and CEDEARs, with no login. It publishes no
// list of its own. Its pages, read 2026-10-25:
//
//   https://www.gorostiagabursatil.com/
//   "Operá en el mercado de capitales argentino ... Acciones, bonos,
//   CEDEARs y dólar MEP"; "CEDEARs y Acciones ... Podés hacerlo en pesos o
//   dólares". Local orders go through Inviu (Rosario Valores clears).
//   https://www.gorostiagabursatil.com/pages/plataforma.html
//   "Operatoria local: Inviu"; foreign markets go through Fenix Securities
//   ("Operatoria internacional"), which is not this place.
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs from BYMA's open data
// (https://open.bymadata.com.ar/): the peso and MEP dollar (D) lines of
// every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable (C) lines are not
// written: the pages name "dólar MEP" and no cable / CCL settlement, nor
// does the tariff. Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and dormant or delisted lines are left out by the shared module
// (the tariff's "Contado Block" rate is for those block lines). Bonds, ONs,
// options, cauciones and cheques are other products. No page names a
// segment, board or title the broker does not trade.
//
// Fees ("Tabla de aranceles y comisiones", in force from 13 September
// 2023), "RENTA VARIABLE - CEDEARS", "Contado": minimum 160, 0,25% to 1%;
// "Servicios de Custodia" 0:
//   https://www.gorostiagabursatil.com/assets/documentos/pdf/TablaDeAranceles.pdf
//
// broker-list.json names one place, Argentina, with no restriction.
//
//   node brokers/gorostiagabursat/gorostiagabursat_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Gorostiaga Bursátil", { cable: false });
fs.writeFileSync(new URL("gorostiagabursat-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Gorostiaga Bursátil: ${rows.length} BYMA lines`);
