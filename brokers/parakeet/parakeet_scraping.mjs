// What Parakeet Capital sells in Buenos Aires shares and CEDEARs, with no
// login. Parakeet Capital S.A. is an agent of BYMA (ALyC propio n° 230
// CNV). Its site runs the Ingematica quote board, which is the BYMA board
// delayed 20 minutes: the local shares, the Pyme shares, the ADR listed in
// Buenos Aires and every CEDEAR, ETF certificates included. Each symbol is
// one line, in pesos or in dollars (MEP or cable), as the board names it.
// Block lines, funds, coupons and the bond, option and future tabs stay
// out, and so does a line with no trade on BYMA in two years: the board
// restamps dead lines every session (CTIOC, INGC, TIIAC dated 21/10/2026
// with no trade, read 2026-10-22), so every symbol with no trade today is
// looked up in BYMA's daily history. The reader is brokers/ldt/ingematica.mjs, shared with LDT Brokers,
// Navarro Viola and Cohen, which run the same board.
//
// Cable lines (C, settled in dollars held abroad) are kept next to the MEP
// (D) lines: Parakeet's standing instructions give a peso account
// (PARAKEET.PESOS) and a dollar account (PARAKEET.USD) at Banco de Valores
// and, under "TRANSFERENCIAS BANCARIAS EN EL EXTERIOR (CABLE)", a Citibank
// NA account (Swift CITIUS33); its fee list charges "Transferencias de
// dólares en el exterior (ingresos, egresos ...)" up to USD 150.
//   https://www.parakeetcapital.com.ar/Informe/Legales/Instrucciones-Permanentes
//   https://www.parakeetcapital.com.ar/Informe/Legales/Comisiones
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   https://www.parakeetcapital.com.ar/Bursatil/Cotizacion/Acciones/
//   https://www.parakeetcapital.com.ar/Financial/ListCotizacion
//   https://open.bymadata.com.ar/ (ISIN on the species card)
//
//   node brokers/parakeet/parakeet_scraping.mjs

import { ingematicaCatalogue } from "../ldt/ingematica.mjs";

await ingematicaCatalogue({ origin: "https://www.parakeetcapital.com.ar", folder: "parakeet", label: "Parakeet Capital" });
