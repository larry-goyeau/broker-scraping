// What Cohen sells in Buenos Aires shares and CEDEARs, with no login.
// Cohen S.A. is an agent of BYMA (ALyC integral n° 21, BYMA agent 46). Its
// site runs the Ingematica quote board, which is the BYMA board delayed 20
// minutes: the local shares, the Pyme shares, the ADR listed in Buenos
// Aires and every CEDEAR, ETF certificates included. Each symbol is one
// line, in pesos or in dollars (MEP or cable), as the board names it.
// Block lines, funds, coupons and the bond, option and future tabs stay
// out, and so does a line with no trade on BYMA in two years: the board
// restamps dead lines every session (CTIOC, INGC, TIIAC dated 21/10/2026
// with no trade, read 2026-10-22), so every symbol with no trade today is
// looked up in BYMA's daily history. The reader is brokers/ldt/ingematica.mjs, shared with LDT Brokers,
// Navarro Viola and Parakeet Capital, which run the same board.
//
// Cable lines (C, settled in dollars held abroad) are kept next to the MEP
// (D) lines: Cohen's "Depósitos y transferencias" page lists, besides its
// Banco de Valores peso and "Dólar Mep" accounts, a "Santander Bank N. A. -
// Dólar Cable" account (Swift SVRNUS33) for client dollars from abroad.
//   https://www.cohen.com.ar/depositostransferencias/
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   https://www.cohen.com.ar/Bursatil/Cotizacion/Acciones/
//   https://www.cohen.com.ar/Financial/ListCotizacion
//   https://open.bymadata.com.ar/ (ISIN on the species card)
//
//   node brokers/cohen/cohen_scraping.mjs

import { ingematicaCatalogue } from "../ldt/ingematica.mjs";

await ingematicaCatalogue({ origin: "https://www.cohen.com.ar", folder: "cohen", label: "Cohen" });
