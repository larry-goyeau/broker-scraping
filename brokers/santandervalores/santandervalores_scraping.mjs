// What Santander Valores (Santander Valores S.A., the broker of Banco
// Santander Argentina) sells in shares and exchange-traded funds online,
// with no login. One account, used in its web platform ("Te ofrecemos una
// plataforma segura y fácil de utilizar para que puedas autogestionar tus
// inversiones"), trades Buenos Aires and abroad.
//
// Its page, read 2026-10-28:
//   https://www.santander.com.ar/santander-valores
//   "Invertí, operá y accedé a oportunidades en el mercado local e
//   internacional desde una plataforma simple y segura"; products "Acciones
//   y CEDEARs", "Compra venta de MEP, CCL y canje"; FAQ: "Podés operar
//   Bonos, Acciones, Cedears y Obligaciones Negociables ... y acceder a
//   productos en el exterior como ETF, ADRs o acciones americanas", and
//   "¿Puedo operar en el mercado internacional? Sí, solo necesitás una
//   cuenta en Santander Valores."
// Fees (help article "Cómo abrir una cuenta en Santander Valores, costos y
// comisiones", "Cuadro de comisiones actualizado al 04/08/2026", an image):
// "ACCIONES Y CEDEAR 0.7", "ETF RENTA VARIABLE (EXTERIOR) 0.4" (percent):
//   https://ayuda.santander.com.ar/RWOEWOCPT1-2/article/PBFVUSC6UB-como-abrir-cuenta-santander-valores-costos-comisiones/
//
// Buenos Aires: BYMA's whole share and CEDEAR board, read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR (ETF CEDEARs included) that trades.
// Cable lines are kept: the broker sells "CCL" (contado con liquidación).
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and dormant
// or delisted lines are left out by the shared module.
//
// United States: no list and no exchange named; ETFs, ADRs and US shares
// are given as examples ("como"), so the owner's rule for a place with no
// list applies: the whole US exchange book of the day
// (../wellstrade/usBook.mjs: shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs, less open trade halts, warrants, rights, units,
// when-issued lines and listed notes). No page names an OTC tier or
// another exception. The US is one NBBO market: one row per title, in
// dollars. broker-list.json gives "United States" and "BYMA", the same
// places. Shared reading: ../bullmarket/bymaUs.mjs.
//
//   node brokers/santandervalores/santandervalores_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.santander.com.ar/santander-valores", [
  /Acciones y CEDEARs/,
  /Compra venta de MEP, CCL y canje/,
  /acceder a productos en el exterior como ETF, ADRs o acciones americanas/,
]);

await bymaUs("Santander Valores", new URL("santandervalores-parsed.json", import.meta.url), { cable: true });
