// What Kutxabank (Kutxabank S.A., Bilbao) sells on the Bolsa de Madrid, with
// no login. Its only place here is the Madrid exchange (XMAD).
//
// Its securities pages, read 2026-10-25, print no list of titles and name no
// excluded segment: the securities account is the "Vía de acceso para todo
// tipo de operaciones bursátiles - Compra-venta de acciones - Solicitud de
// OPVs - Compra-venta de derechos" and the real-time service covers the
// "Mercado continuo en tiempo real".
//   https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/productos/bolsa
//   https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/productos/servicios-6/cuenta-deposito-de-valores/pys
//   https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/productos/servicios-6/bolsa-en-tiempo-real/pys
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
// Fees: "Tarifas máximas en operaciones y servicios del mercado de valores"
// (in force 24-11-2025), linked from the bank's tariffs page: "En Mercados
// españoles. Recepción, transmisión, ejecución y liquidación" 0.60%, min
// 9.00 EUR per operation.
//   https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/condiciones-y-comisiones-por-servicio-tarifas-maximas/generico
//   https://portal.kutxabank.es/cs/Satellite?blobcol=urldata&blobheader=application%2Fpdf&blobkey=id&blobtable=MungoBlobs&blobwhere=1312545474083&ssbinary=true
//
//   node brokers/kutxabank/kutxabank_scraping.mjs

import { writeMadridCatalogue } from "./bmeBook.mjs";

const rows = await writeMadridCatalogue(import.meta.url, "kutxabank-parsed.json");
console.error(`Kutxabank: ${rows.length} rows`);
