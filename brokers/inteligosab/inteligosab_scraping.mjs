// What Inteligo Sociedad Agente de Bolsa S.A. (Lima, Interbank group,
// regulated by the SMV) sells in shares and ETFs, with no login. Clients
// open an account and trade in its app and web platform
// (app.inteligosab.com): "Acceda a la Bolsa de Nueva York y ejecute órdenes
// en tiempo real", and "Bolsa: local e internacional Invertir en valores a
// través de la Bolsa de Valores de Lima, y del mercado internacional". Its
// personas-naturales page sells "Compra y venta de acciones en la Bolsa de
// Valores de Lima y las principales bolsas del exterior: NYSE, NASDAQ,
// Canada, Londres, entre otras. Compra y venta de ETFs". It publishes no
// list.
//
//   https://www.inteligosab.com/
//   https://www.inteligosab.com/es/personas-naturales
//
// Two places, as in broker-list.json (New York Stock Exchange, Bolsa de
// Valores de Lima):
// - Lima: the whole BVL share and ETF book, read by ./limaBook.mjs: the
//   main and second boards (RV1, RV2), and the foreign-securities segment
//   (RV3: US and other foreign shares and ETFs listed on the BVL, traded in
//   dollars in Lima), less never-traded and dormant lines and the
//   non-ETF investment funds. The tariff's "Rueda - Valores Representativos
//   de Participación" covers every renta variable line of the BVL.
// - US: the whole US exchange book of the day (../wellstrade/usBook.mjs:
//   shares, ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on
//   every US exchange, less open trade halts, warrants, rights, units,
//   when-issued lines and listed notes). The app names the "Bolsa de Nueva
//   York" and the products page "NYSE, NASDAQ ... entre otras", examples
//   of others, so by the owner's rule the place is the whole country (one
//   NBBO market, one row per title). OTC is not named and is not added.
//   Canada and London, also named there, are advised products with no
//   broker-list place; they are not added.
//
// Fees ("Formato 1-A Tarifario de Servicios Relacionados Directamente a
// Actividades de Intermediación", May 2026): "1. Rueda - Valores
// Representativos de Participación a. Operaciones al Contado ... de 0.05%
// a 2.00% personas naturales", "Comisión Mínima ... S/. 35.00 US$10":
//   https://www.inteligosab.com/documents/d/guest/tarifario_inteligo_sab_may2026
//   (linked as "Tarifario" on https://www.inteligosab.com/es/informacion-financiera)
//
//   node brokers/inteligosab/inteligosab_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence, pdf } from "../bullmarket/bymaUs.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { limaBook } from "./limaBook.mjs";

await evidence("https://www.inteligosab.com/", [/Acceda a la Bolsa de Nueva York/, /Bolsa de Valores de Lima/]);
await evidence("https://www.inteligosab.com/es/personas-naturales", [/NYSE, NASDAQ, Canada, Londres, entre otras/]);
await evidence("https://www.inteligosab.com/es/informacion-financiera", [/tarifario_inteligo_sab/]);
await pdf("https://www.inteligosab.com/documents/d/guest/tarifario_inteligo_sab_may2026");

const lima = await limaBook();
if (lima.length < 400) throw new Error(`only ${lima.length} BVL lines`);
const book = await usBook();
const us = withoutObligations([...book]);
if (us.length < 10000) throw new Error(`only ${us.length} US rows`);

const rows = stampRows(withoutObligations([...lima.map(({ segment, ...row }) => row), ...us]));
fs.writeFileSync(new URL("inteligosab-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`Inteligo SAB: ${rows.length} rows`, counts);
