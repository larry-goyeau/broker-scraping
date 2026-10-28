// What PGA Valores (PGA Valores S.A., ALyC y AN Propio n° 1402 CNV) sells in
// shares and exchange-traded funds, with no login. It publishes no list.
// Its pages name local and international shares, ETFs and US shares,
// traded online:
//
//   https://pgavalores.com.ar/
//   "Invertí en las mejores empresas argentinas e internacionales en pesos
//   o dólares. Podés operar: • Acciones • Bonos • Fondos Comunes de
//   Inversión • ETF ..."; "Operatoria Online".
//   https://pgavalores.com.ar/faqs/
//   "¿Puedo operar en Estados Unidos a través de ustedes? Sí." and
//   "Podés operar caución, cheques de pago diferido, títulos públicos,
//   Letras del Tesoro, acciones, Obligaciones Negociables, opciones,
//   futuros de ROFEX, acciones de EEUU, comprar y vender dólares, etc."
//
// Buenos Aires: BYMA's whole share and CEDEAR board (international
// companies bought in pesos are CEDEARs; CEDEARs of US ETFs included), read
// by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR that BYMA quotes and that trades.
// Cable lines are kept: the account buys US shares ("Acciones Exterior"),
// with dollars held abroad. Block lines, closed-end funds, bond CEDEARs,
// rights, warrants and dormant or delisted lines are left out by the shared
// module.
//
// United States: no exchange named and no exception, so the whole US
// exchange book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas exchanges, less open trade
// halts, warrants, rights, units, when-issued lines and listed notes. OTC
// lines are not added. One row per title, in dollars.
//
// Fees ("Anexo I – Tabla de aranceles y comisiones"): "Acciones Locales $0
// 200 hasta 1,5%" and "Acciones Exterior $0 200 hasta 1,5%", plus market
// fees and IVA:
//   https://pgavalores.com.ar/wp-content/uploads/2025/01/Comisiones.pdf
//
//   node brokers/pgavalores/pgavalores_scraping.mjs

import { bymaUs, evidence, pdf } from "../bullmarket/bymaUs.mjs";

await evidence("https://pgavalores.com.ar/", [
  /empresas argentinas e internacionales en pesos o dólares/i,
  /•\s*ETF/,
  /2025\/01\/Comisiones\.pdf/,
]);
await evidence("https://pgavalores.com.ar/faqs/", [/¿Puedo operar en Estados Unidos a través de ustedes\?\s*Sí/i, /acciones de EEUU/i]);
await pdf("https://pgavalores.com.ar/wp-content/uploads/2025/01/Comisiones.pdf");

await bymaUs("PGA Valores", new URL("pgavalores-parsed.json", import.meta.url), { cable: true });
