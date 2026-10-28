// What CaixaGuissona (Caja Rural de Guissona, Soc. Coop. Crédito) sells on the
// Bolsa de Madrid, with no login. Its place here is the Madrid exchange
// (XMAD). Orders go through the GVC Gaesco investment platform the bank
// offers: "Gracias a nuestro acuerdo con GVC Gaesco ... usted puede comprar y
// vender valores".
//
// Its pages, read 2026-10-25, print no list of titles and name no excluded
// segment: "Acciones cotizadas en los principales mercados nacionales e
// internacionales", "ETFs: ... una amplia gama de productos de inversión de
// terceros, como los ETFs", "Desde fondos de inversión hasta acciones y
// ETFs". Its tariff prices "Intermediación en mercados de renta variable,
// ETFs y warrants" in "Mercados españoles" as one item. So ETFs are kept.
//   https://www.caixaguissona.com/es/public/gaescoadvantatges
//   https://www.caixaguissona.com/es/public/borsavalues
//
// So the catalogue is the whole Madrid book (../kutxabank/bmeBook.mjs, read
// from BME's own price tables): every Mercado Continuo share, Spanish or
// foreign, the BME ETF segment, the Latibex lines (in euros) and the Madrid
// floor, minus suspended lines and lines with no trade this year. Left out:
// BME Growth and the other BME MTF segments (another operator; the tariff
// names only "Mercados españoles" and does not name BME Growth or the MAB),
// the Barcelona, Bilbao and Valencia floors, rights, warrants and bonds.
//
// Fees: tariff PDF linked from the bank's "Compra-venta de valores" page,
// "1.1 Renta Variable y ETFs", "Mercados españoles", CaixaGuissona channel:
// up to 4.000 EUR "3,50€ Tarifa plana", 4.000 to 40.000 EUR "8,00€ Tarifa
// plana", above 40.000 EUR "0,08% Sobre efectivo" (Gaesco desk: 0,25%, min
// 9,00 EUR), plus 0,12 EUR clearing per execution, 0,35 EUR settlement per
// operation and the exchange fees. The PDF host timed out from here on
// 2026-10-25; the text was read from the Wayback copy of 2024-08-12, and the
// bank's platform page still says "A partir de 3,5 EUR" for "Bolsa Nacional".
//   https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf
//   https://web.archive.org/web/20240812211833/https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf
//
//   node brokers/caixaguissona/caixaguissona_scraping.mjs

import { writeMadridCatalogue } from "../kutxabank/bmeBook.mjs";

const rows = await writeMadridCatalogue(import.meta.url, "caixaguissona-parsed.json");
console.error(`CaixaGuissona: ${rows.length} rows`);
