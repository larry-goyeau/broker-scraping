// What La California (PSA La California S.A., Pergamino; "Agente de
// Negociación registrado bajo el número 498", clearing through its ALyC
// integral Rosario Valores S.A.) sells in Buenos Aires shares and CEDEARs,
// with no login. Its clients trade on BYMA's own screen, DMA Anima, whose
// user manual it publishes: orders for "Acciones - CEDEARS - Bonos"; the
// "Acciones Locales" screen shows "las acciones locales. Éstas incluyen las
// acciones líderes y las acciones generales"; the CEDEARS screen shows "los
// precios de mercado de los CEDEARS".
//   https://lacalifornia.com.ar/wp-content/uploads/2024/09/DMA-Anima-Manual-de-Usuario.pdf
//
// It names no list of its own and leaves no panel out, so the catalogue is
// BYMA's whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs:
// the leader and general panels, every CEDEAR (ETF certificates such as SPY
// and QQQ included), each with its peso line and its MEP-dollar (D) line.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and lines
// with no trade in months are left out by that module.
//
// Cable (C) lines are not written: the only dollar the manual names is the
// MEP ("cotizaciones de tipos de cambio como el dólar MEP"), the deposit
// accounts are a peso and a dollar account at Banco Comafi in Argentina, and
// the fee list has no cable or foreign-transfer line. Bonds, letras,
// options, futures and funds are other products.
//
// Fees ("Listado de Aranceles - Septiembre 2022": "Contado - Renta
// variable ... 0,12" %, plus 21% VAT; "Los aranceles informados no incluyen
// a los de los Mercados y ALYC"):
//   https://lacalifornia.com.ar/aranceles/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/california/california_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("La California", { cable: false });
fs.writeFileSync(new URL("california-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`La California: ${rows.length} rows`);
