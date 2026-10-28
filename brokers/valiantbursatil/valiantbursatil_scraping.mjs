// What Valiant Bursátil S.A.U. (Bahía Blanca and Buenos Aires; owned by the
// Bolsa de Comercio de Bahía Blanca) sells in Buenos Aires shares and
// CEDEARs, with no login. It is a BYMA agent and publishes no list of its
// own. Its FAQ says clients reach the whole local market, CEDEARs included,
// and trade MEP and cable dollars:
//
//   https://valiantbursatil.com/institucional/preguntas-frecuentes.html
//   "tenés acceso a todos los activos del mercado local y podés invertir en
//   el mundo a través de fondos y CEDEARs"
//   "podés operar acciones locales e internacionales (CEDEARS), bonos
//   públicos y corporativos, ... y compra y venta de dólares MEP y CCL."
//   https://valiantbursatil.com/productos.html
//   "Compra y venta de títulos privados."
//
// So the catalogue is BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR (CEDEARs of US ETFs such as SPY and QQQ
// included) that BYMA quotes and that trades. Cable lines are kept because
// the FAQ names CCL dollar trading. Block lines, closed-end funds, bond
// CEDEARs, rights, warrants and dormant or delisted lines are left out by
// the shared module. Bonds, ONs, options, futures, cauciones, cheques and
// funds are other products. No page names a segment, board or title the
// broker does not trade.
//
// Fees ("TABLA DE COMISIONES VALIANT BURSÁTIL S.A.U.", "Vigente a partir del
// 22/09/2026"): "C/V TÍTULOS PRIVADOS" market fee 0.08%, arancel 0.9%,
// minimum $45 + IVA; monthly custody by holding band.
//   https://valiantbursatil.com/pdf/apertura/valiantbursatil-tabla-de-comisiones-26-09-22.pdf
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   node brokers/valiantbursatil/valiantbursatil_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBook } from "../bancogalicia/bymaBook.mjs";

const { rows } = await bymaBook("Valiant Bursátil", { cable: true });
fs.writeFileSync(new URL("valiantbursatil-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error(`Valiant Bursátil: ${rows.length} BYMA lines`);
