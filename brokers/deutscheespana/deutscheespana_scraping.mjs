// What Deutsche Bank España (Deutsche Bank S.A.E.) sells on the Bolsa de
// Madrid, with no login. Its only place here is the Madrid exchange (XMAD).
//
// Its online banking guide, read 2026-10-25, prints no list of titles and
// names no excluded segment: "Orden de Compra puede cursar órdenes de compra
// de aquellos títulos que desee adquirir tanto en el mercado español como en
// mercados extranjeros".
//   https://www.deutsche-bank.es/es/guia-ayuda/operativa-banca-online.html
// Its securities tariff prices equity orders as one item, "acciones y
// participaciones de ETF", so ETFs are kept.
//
// So the catalogue is the whole Madrid book (../kutxabank/bmeBook.mjs, read
// from BME's own price tables): every Mercado Continuo share, Spanish or
// foreign, the BME ETF segment, the Latibex lines (in euros) and the Madrid
// floor, minus suspended lines and lines with no trade this year. Left out:
// BME Growth and the other BME MTF segments (another operator; the bank's
// pages do not name them), the Barcelona, Bilbao and Valencia floors,
// rights, warrants and bonds.
//
// Fees: "Folleto informativo de tarifas máximas en operaciones y servicios
// del mercado de valores": "En mercados españoles: recepción, transmisión,
// ejecución y liquidación" 0.31%, min 12.00 EUR per operation.
//   https://www.deutsche-bank.es/dam/spain/es/pbc/pdf/Tarifas_valores.pdf
//
//   node brokers/deutscheespana/deutscheespana_scraping.mjs

import { writeMadridCatalogue } from "../kutxabank/bmeBook.mjs";

const rows = await writeMadridCatalogue(import.meta.url, "deutscheespana-parsed.json");
console.error(`Deutsche Bank España: ${rows.length} rows`);
