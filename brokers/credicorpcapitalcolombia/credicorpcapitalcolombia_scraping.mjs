// What Credicorp Capital Colombia S.A. (sociedad comisionista de bolsa)
// sells online in shares and ETFs, with no login. Its capital-markets page
// says "negociamos acciones ordinarias, acciones privilegiadas, acciones
// con dividendo preferencial y sin derecho a voto, ETFs ... Adicionalmente
// contamos con una plataforma electrónica de enrutamiento de órdenes al
// mercado colombiano (E-trading)", and the E-trading page: "usted podrá
// ingresar al mercado de acciones colombiano de forma rápida ... sin
// necesidad de intermediarios". It publishes no list and names no board or
// title it does not route.
//
//   https://www.credicorpcapital.com/Colombia/Neg/MerCap/Paginas/Ser.aspx
//   https://www.credicorpcapital.com/Colombia/Neg/MerCap/Paginas/e-trading.aspx
//
// So the catalogue is the BVC's whole equity book, read by
// ../progresion/bvcColombiaBook.mjs: the local market (Colombian shares,
// preferred shares, local ETFs, the PEI trust) and the Mercado Global
// Colombiano (foreign shares and ETFs listed on the BVC, traded there in
// pesos: both are "el mercado de acciones colombiano"), less suspended,
// never-traded and dormant lines. Canacol Energy (CNEC) is left out as in
// brokers/progresion (spot trading suspended by the BVC in November 2025).
// The US shares of tyba, Credicorp's app, are another broker
// (brokers/tyba).
//
// Fees (E-trading page, "Tarifas ... por orden"): "$0.00 a $10.000.000
// $30.000 + IVA; $10.000.001 a $15.000.000 0,3% + IVA; ... $50.000.001 en
// adelante 0,20% + IVA"; initial deposit "$10.000.000":
//   https://www.credicorpcapital.com/Colombia/Neg/MerCap/Paginas/e-trading.aspx
//
//   node brokers/credicorpcapitalcolombia/credicorpcapitalcolombia_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { evidence } from "../bullmarket/bymaUs.mjs";
import { bvcColombiaBook } from "../progresion/bvcColombiaBook.mjs";

await evidence("https://www.credicorpcapital.com/Colombia/Neg/MerCap/Paginas/e-trading.aspx", [/mercado de acciones colombiano/, /\$30\.000 \+ IVA/]);
await evidence("https://www.credicorpcapital.com/Colombia/Neg/MerCap/Paginas/Ser.aspx", [/plataforma electr[oó]nica de enrutamiento de [oó]rdenes al mercado colombiano/]);

const DROP = new Set(["CNEC"]);
const book = await bvcColombiaBook({ segments: ["EQTY", "MGC"] });
const rows = book.filter((row) => !DROP.has(row.ticker)).map(({ segment, ...row }) => row);
if (rows.length < 100) throw new Error(`only ${rows.length} BVC lines kept`);
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("credicorpcapitalcolombia-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const counts = {};
for (const row of stamped) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(`Credicorp Capital Colombia: ${stamped.length} BVC lines, ${stamped.filter((row) => row.isin).length} with an ISIN`, counts);
