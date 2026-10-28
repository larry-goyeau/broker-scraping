// What Caixa Rural Galega (Caixa Rural Galega, S. Coop. de Crédito Limitada
// Gallega, CNMV register no. 3070) sells on the Bolsa de Madrid, with no
// login. Its only place here is the Madrid exchange (XMAD).
//
// Its stock page (https://www.caixaruralgalega.gal/particulares/bolsa-mercados)
// sits behind a bot check and was not read; its securities tariff names no
// excluded segment and prices "Operaciones de intermediación en mercados de
// valores de renta variable" "En Mercados españoles" as one item. No list of
// titles is published.
//
// So the catalogue is the whole Madrid book (../kutxabank/bmeBook.mjs, read
// from BME's own price tables): every Mercado Continuo share, Spanish or
// foreign, the BME ETF segment (ETFs are listed shares of the exchange and
// nothing on the bank's pages leaves them out), the Latibex lines (in euros)
// and the Madrid floor, minus suspended lines and lines with no trade this
// year. Left out: BME Growth and the other BME MTF segments (another
// operator; the bank's pages do not name them), the Barcelona, Bilbao and
// Valencia floors, rights, warrants and bonds.
//
// Fees: "Folleto informativo de tarifas máximas en operaciones y servicios
// del mercado de valores" (in force 20-02-2017): "En Mercados españoles.
// Recepción, transmisión, ejecución y liquidación" 0.55%, min 15.00 EUR.
//   https://www.caixaruralgalega.gal/sites/default/files/2024-07/FOLLETO%20TARIFAS%20CNMV%203070.pdf
//
//   node brokers/caixaruralgalega/caixaruralgalega_scraping.mjs

import { writeMadridCatalogue } from "../kutxabank/bmeBook.mjs";

const rows = await writeMadridCatalogue(import.meta.url, "caixaruralgalega-parsed.json");
console.error(`Caixa Rural Galega: ${rows.length} rows`);
