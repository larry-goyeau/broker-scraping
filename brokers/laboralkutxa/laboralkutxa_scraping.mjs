// What LABORAL Kutxa (Caja Laboral Popular) sells online through its
// "servicio de Bolsa" on the Spanish stock market and BME Growth, with no
// login.
//
// "Servicio para operar en los mercados bursátiles. Posibilita operar sobre
// acciones, ETFs*…"; "LABORAL Kutxa te facilita el servicio de Bolsa a
// través de la Banca Online, Banca Móvil, Telebanka y la red de sucursales".
// The bank publishes no list of what it sells (its market information links
// to Norbolsa, the Bilbao broker that executes its orders).
//   https://www.laboralkutxa.com/es/personas/ahorro-inversion/bolsa-mercados/
//
// Places. broker-list.json gives Bolsa de Bilbao and BME Growth; the bank's
// page names no market. Spanish shares and ETFs trade on one book, the
// SIBE (Sistema de Interconexión Bursátil, the Mercado Continuo) that the
// four Spanish exchanges share; an order of a Bilbao member is matched
// there. So the Bilbao place is the SIBE book as ../kutxabank/bmeBook.mjs
// reads it from BME (segments SIBE and ETF: every share and ETF of the
// Mercado Continuo, minus suspended lines and lines with no trade this
// year), written as exchange "Bolsa de Bilbao", MIC XBIL, as
// broker-list.json names the place. Its quote is the SIBE book, the same
// one ../kutxabank writes as Bolsa de Madrid. Latibex and the Madrid floor
// are Madrid-only segments and are not read; the Bilbao floor lists no
// share today.
// BME Growth is added with `growth: true` (exchange "BME Growth", MIC
// MABX): BME's MTF segment of growth shares. BME ScaleUp, SICAVs and the
// other MTF segments are not read.
//
// Fees: "Folleto informativo de tarifas máximas en operaciones y servicios
// del mercado de valores" (Caja Laboral Popular, Nº Registro Oficial 3035),
// "Operaciones de intermediación en mercados de valores de renta variable
// - En Mercados españoles. Recepción, transmisión, ejecución y
// liquidación 0,60 % sobre efectivo, mínimo por operación 12,00".
//   https://www.laboralkutxa.com/pdf/es/informacion-legal/tablon-anuncios/folleto-tarifas-valores.pdf
//
//   node brokers/laboralkutxa/laboralkutxa_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { madridBook } from "../kutxabank/bmeBook.mjs";
import { pageSays } from "../bajaj/pageSays.mjs";
import fs from "node:fs";

const OUTPUT = new URL("laboralkutxa-parsed.json", import.meta.url);

await pageSays("https://www.laboralkutxa.com/es/personas/ahorro-inversion/bolsa-mercados/", [/Posibilita operar sobre acciones, ETFs/, /Banca Online/]);

const book = await madridBook({ segments: ["SIBE", "ETF"], growth: true });
const rows = book.listed
  .filter((row) => ["STOCK", "ETF"].includes(row.type))
  .map((row) => (row.mic === "XMAD" ? { ...row, exchange: "Bolsa de Bilbao", mic: "XBIL", raw: `${row.raw} | SIBE` } : row));
const kept = stampRows(withoutObligations(rows));
const bilbao = kept.filter((r) => r.exchange === "Bolsa de Bilbao").length;
const growth = kept.filter((r) => r.exchange === "BME Growth").length;
if (bilbao < 100 || growth < 50) throw new Error(`only ${bilbao} SIBE and ${growth} BME Growth lines`);
for (const isin of ["ES0113900J37", "ES0148396007"]) if (!kept.some((r) => r.isin === isin)) throw new Error(`${isin} missing`);
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));
console.error(`${kept.length} lines: ${bilbao} Bolsa de Bilbao (SIBE), ${growth} BME Growth; ${book.suspended.length} suspended, ${book.idle.length} idle left out`);
