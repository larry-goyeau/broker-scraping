// What LBO (LBO S.A., ALyC Integral Agroindustrial n° 160 CNV, Rosario)
// sells in shares and exchange-traded funds, with no login. It publishes no
// list. Its commission list prices local shares and CEDEARs and, from the
// same account, shares and ETFs of NYSE and Nasdaq bought directly:
//
//   https://www.lbo.com.ar/listado-de-comisiones
//   "Acciones Directo 1,00 % $ 50,00", "Cedears Directo 1,00 % $ 50,00",
//   "Acciones - ETF NYSE / NASDAQ Directo 1,00 % U$S 1,00", plus IVA.
//   https://www.lbo.com.ar/guias-de-uso
//   "¿Cómo opero Acciones o CEDEARs?" (orders from the client platform)
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included), read by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D)
// and cable (C) lines of every local share and CEDEAR that BYMA quotes and
// that trades. Cable lines are kept: the account buys NYSE and Nasdaq
// shares with a dollar minimum, dollars held abroad. Block lines,
// closed-end funds, bond CEDEARs, rights, warrants and dormant or delisted
// lines are left out by the shared module.
//
// United States: the list names NYSE and NASDAQ and no other US exchange,
// so by the owner's rule only their listings are kept: shares and ETFs of
// the US exchange book of the day (../wellstrade/usBook.mjs: shares, ADRs,
// REITs, preferreds, closed-end funds, ETFs and ETNs, less open trade
// halts, warrants, rights, units, when-issued lines and listed notes) on
// NYSE (XNYS) and Nasdaq (XNAS). NYSE Arca, NYSE American, Cboe BZX, Texas
// and IEX lines are not written. No page names an exception. One row per
// title, in dollars. broker-list.json names BYMA, NYSE and Nasdaq, as here.
//
//   node brokers/lbo/lbo_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.lbo.com.ar/listado-de-comisiones", [
  /Acciones - ETF NYSE \/ NASDAQ/,
  /Cedears/,
  /U\$S 1,00/,
]);
await evidence("https://www.lbo.com.ar/guias-de-uso", [/¿Cómo opero Acciones o CEDEARs\?/]);

await bymaUs("LBO", new URL("lbo-parsed.json", import.meta.url), { cable: true, mics: ["XNYS", "XNAS"] });
