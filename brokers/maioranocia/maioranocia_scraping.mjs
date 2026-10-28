// Maiorano & Cía. Sociedad de Bolsa is a Montevideo stockbroker (corredor
// de bolsa), supervised by the Banco Central del Uruguay and listed on the
// Bolsa de Valores de Montevideo's "Corredores de Bolsa" member page. It
// says it operates "en renta fija como en renta variable y fondos de
// inversión", through counterparties and platforms "tanto a nivel local
// como internacional". Its local share market is the BVM (MIC XMNT).
//
// Maiorano prints no list of the shares it sells and names no exclusion,
// so the catalogue is the whole BVM share board: every share line on the
// BVM full daily closing report, priced in USD (every BVM share trades in
// US dollars). The BVM lists no ETF.
//
// What stays out: a line the BVM marks suspended ("# = con cotización
// suspendida"), a line that never traded, a line without an ISIN, and the
// dead companies still kept in the BVM register but not on the board.
// Bonds, notes, trust certificates and investment funds are not shares.
// A few lines are dormant (PAMER last traded in 2002, ALCAN in 2021); they
// stay because the BVM still quotes them; the last trade date is in raw.
//
// The BVM crawl lives in ./bvmBook.mjs.
//
//   https://www.maiorano.com.uy/
//   https://www.maiorano.com.uy/servicios.html
//   https://www.bvm.com.uy/operadores/corredores-de-bolsa
//   https://www.bvm.com.uy/operativa/papeles?especie=ACC
//
// Fees (order execution 1%, minimum USD 100, plus a USD 15 ticket; custody
// from USD 120 a year / 0.20%; valid from October 2023, VAT excluded):
//   https://www.maiorano.com.uy/files/legal/Tarifario%20MAIORANO.pdf
//
//   node brokers/maioranocia/maioranocia_scraping.mjs

import { writeBvmCatalogue } from "./bvmBook.mjs";

await writeBvmCatalogue(import.meta.url, "maioranocia-parsed.json");
