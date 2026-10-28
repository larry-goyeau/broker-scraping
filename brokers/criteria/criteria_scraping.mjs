// What Criteria (Criteria WM S.A., Buenos Aires) sells in Buenos Aires
// shares and CEDEARs, with no login. Its app guide, "App Criteria Digital -
// Guía rápida", covers "Cómo realizar operaciones con Fondos Comunes de
// Inversión, Cedears, Acciones, Bonos y Letras". The shares screen offers a
// "Selección de Panel Merval o General" ("Muestra las Acciones disponibles
// para operar en el Merval o Panel general"); the CEDEAR screen lists every
// CEDEAR with its peso, dollar and cable lines (AAL in AR$, AALD in U$D,
// AALC in "U$D-C").
//   https://criteria.com.ar/wp-content/uploads/2024/10/Cr-App_GuiaRapida-Operacion.pdf
//
// It names no list of its own and leaves no panel out, so the catalogue is
// BYMA's whole share and CEDEAR board, read by ../bancogalicia/bymaBook.mjs:
// the Merval and general panels, every CEDEAR (ETF certificates such as SPY
// and QQQ included), each with its peso line, its MEP-dollar (D) line and
// its cable (C) line. Block lines, closed-end funds, bond CEDEARs, rights,
// warrants and lines with no trade in months are left out by that module.
//
// Cable lines are kept: the app lists them ("U$D-C"), and the fee page
// charges cable and MEP settlement ("Contado Inmediato Cable/MEP ... 1.5% +
// entre 100 y 150 USD"; "Las comisiones originadas en dólar cable y dólar
// MEP se cobran en la misma moneda"; "Pago de Transferencia al Exterior USD
// 300"). Bonds, letras, options, futures and funds are other products.
//
// Fees ("Renta Variable - Contado Inmediato ... Hasta 1.5%", plus VAT and
// market fees; "Mantenimiento de Cuenta ... Hasta 2%"):
//   https://criteria.com.ar/tarifas/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/criteria/criteria_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Criteria", { cable: true });
fs.writeFileSync(new URL("criteria-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Criteria: ${rows.length} rows`);
