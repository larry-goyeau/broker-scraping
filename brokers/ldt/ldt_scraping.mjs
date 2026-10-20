// What LDT Brokers sells in Buenos Aires shares and CEDEARs, with no login.
// LDT is an agent of BYMA. Its site runs the Ingematica quote board, which is
// the BYMA board delayed 20 minutes: the local shares, the Pyme shares, the
// ADR listed in Buenos Aires and every CEDEAR, ETF certificates included.
// Each symbol is one line, in pesos or in dollars (MEP or cable), as the
// board names it. Block lines, funds, coupons and the bond, option and
// future tabs stay out. The reader is ingematica.mjs in this folder, shared
// with Navarro Viola and Parakeet Capital, which run the same board.
//
//   https://www.ldtbrokers.com/Bursatil/Cotizacion/Acciones/
//   https://www.ldtbrokers.com/Financial/ListCotizacion
//   https://open.bymadata.com.ar/ (ISIN on the species card)
//
//   node brokers/ldt/ldt_scraping.mjs

import { ingematicaCatalogue } from "./ingematica.mjs";

await ingematicaCatalogue({ origin: "https://www.ldtbrokers.com", folder: "ldt", label: "LDT Brokers" });
