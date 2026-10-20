// What Navarro Viola sells in Buenos Aires shares and CEDEARs, with no login.
// Navarro Viola is an agent of BYMA. Its site runs the Ingematica quote
// board, which is the BYMA board delayed 20 minutes: the local shares, the
// Pyme shares, the ADR listed in Buenos Aires and every CEDEAR, ETF
// certificates included. Each symbol is one line, in pesos or in dollars
// (MEP or cable), as the board names it. Block lines, funds, coupons and the
// bond, option and future tabs stay out. The reader is brokers/ldt/ingematica.mjs,
// shared with LDT Brokers and Parakeet Capital, which run the same board.
//
//   https://www.navarroviola.com.ar/bursatil/cotizacion/acciones
//   https://www.navarroviola.com.ar/Financial/ListCotizacion
//   https://open.bymadata.com.ar/ (ISIN on the species card)
//
//   node brokers/navarroviola/navarroviola_scraping.mjs

import { ingematicaCatalogue } from "../ldt/ingematica.mjs";

await ingematicaCatalogue({ origin: "https://www.navarroviola.com.ar", folder: "navarroviola", label: "Navarro Viola" });
