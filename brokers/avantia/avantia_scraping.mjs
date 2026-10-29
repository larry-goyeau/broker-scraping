// What Avantia Valores S.A. (ALyC CNV) sells in shares and ETFs, with no
// login. Clients open an account and trade in its app
// (app.avantiavalores.com.ar) and virtual broker
// (virtualbroker-avantiavalores.aunesa.com). Its products page sells
// "Acciones Argentinas (Local y ADR)" and "Acciones del Exterior (Cedear e
// Internacional)", and "Operatoria de Dólar Mep y Dólar Cable con
// instrumentos financieros". It publishes no list and names no
// restriction.
//
//   https://avantiavalores.com.ar/
//
// So the catalogue is BYMA's whole share and CEDEAR board
// (../bancogalicia/bymaBook.mjs) plus the whole US exchange book
// (../wellstrade/usBook.mjs), through ../bullmarket/bymaUs.mjs: "Acciones
// del Exterior ... Internacional" names no exchange, so by the owner's rule
// the place is the whole country (all US exchanges, one NBBO market);
// OTC is not named and not added. broker-list.json gives BYMA and the United
// States with no restriction. Cable (C) lines on BYMA are kept: the site
// sells "Dólar Cable" operations and the tariff prices "Emisora/Receptora
// Fondos Internacional 1,5% Mínimo USD 75".
//
// Fees ("Tabla de Aranceles y Comisiones", August 2024, maximum, plus IVA
// and market rights): "Acciones y Cedears 1,5%"; "Acciones Internacional
// 2,0% Mínimo: USD 100":
//   https://avantiavalores.com.ar/wp-content/uploads/2024/08/Aranceles-y-Comisiones.pdf
//
//   node brokers/avantia/avantia_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://avantiavalores.com.ar/", [/Acciones del Exterior \(Cedear e Internacional\)/, /D[oó]lar Cable/]);
await pdf("https://avantiavalores.com.ar/wp-content/uploads/2024/08/Aranceles-y-Comisiones.pdf");

await bymaUs("Avantia Valores", new URL("avantia-parsed.json", import.meta.url), { cable: true });
