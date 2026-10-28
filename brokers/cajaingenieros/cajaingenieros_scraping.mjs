// What Caja Ingenieros (Caixa de Crèdit dels Enginyers - Caja de Crédito de
// los Ingenieros, S. Coop. de Crédito, CNMV register no. 3025) sells on the
// Bolsa de Madrid, with no login. Its place here is the Madrid exchange (XMAD).
//
// Its pages print no list of titles and name no excluded segment. The
// "Bolsa y mercados" page, read 2026-10-25, gives its trading discount on
// "operaciones en Acciones, ETF (Fondos cotizados) y SICAV" and says "Opera en
// los principales mercados nacionales e internacionales"; its list of online
// operations names "Compra y venta de acciones y ETF". So ETFs are kept.
//   https://www.caixaenginyers.com/es/bolsa-y-mercados
//   https://www.caixaenginyers.com/documents/20143/1080191/Operaciones+por+canales_cast.pdf
//
// So the catalogue is the whole Madrid book (../kutxabank/bmeBook.mjs, read
// from BME's own price tables): every Mercado Continuo share, Spanish or
// foreign, the BME ETF segment, the Latibex lines (in euros) and the Madrid
// floor, minus suspended lines and lines with no trade this year. Left out:
// BME Growth and the other BME MTF segments, SICAVs included (another
// operator; the bank's pages and tariff do not name BME Growth or the MAB),
// the Barcelona, Bilbao and Valencia floors, rights, warrants and bonds.
//
// Fees: "Folleto informativo de tarifas máximas en operaciones y servicios del
// mercado de valores" (in force 01-01-2023): "En Mercados españoles.
// Recepción, transmisión, ejecución y liquidación" 0,30%, min 8,00 EUR per
// operation, plus the market and settlement fees.
//   https://www.caixaenginyers.com/documents/20143/1452113/Tarifas+por+operaciones+y+servicios+del+mercado+de+valores.pdf
//
//   node brokers/cajaingenieros/cajaingenieros_scraping.mjs

import { writeMadridCatalogue } from "../kutxabank/bmeBook.mjs";

const rows = await writeMadridCatalogue(import.meta.url, "cajaingenieros-parsed.json");
console.error(`Caja Ingenieros: ${rows.length} rows`);
