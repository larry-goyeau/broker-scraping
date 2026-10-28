// What PSEC (Prosecurities S.A., ALyC y AN Propio n° 30 CNV, BYMA member n°
// 163) sells in shares and exchange-traded funds, with no login. It
// publishes no list. Its product pages and FAQ say:
//
//   https://psec.com.ar/productos/acciones.html
//   "Tendrás acceso a todas las acciones negociadas en Argentina y USA,
//   pudiendo comprarlas y venderlas desde nuestra plataforma web."
//   https://psec.com.ar/productos/nyse.html
//   "Invertí en el New York Stock Exchange desde PSEC." "Vas a tener acceso
//   a todas las acciones negociadas en USA."
//   https://psec.com.ar/herramientas/preguntas-frecuentes.html
//   "¿Puedo operar acciones de EEUU? Sí, por medio de PSEC podés invertir en
//   acciones y ETF que coticen en el NYSE."
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included; Cedears is one of its products), read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR that BYMA quotes and that trades.
// Cable lines are kept: the tariff charges "Mandatos del exterior" and the
// account holds US shares, dollars abroad. Block lines, closed-end funds,
// bond CEDEARs, rights, warrants and dormant or delisted lines are left out
// by the shared module.
//
// United States: the pages name NYSE but also say "todas las acciones
// negociadas en USA", which is every US exchange, so the owner's
// named-venue rule does not narrow it: the whole US exchange book of the
// day (../wellstrade/usBook.mjs): shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas exchanges, less open trade halts, warrants,
// rights, units, when-issued lines and listed notes. OTC lines are not
// added. One row per title, in dollars. broker-list.json names BYMA and the
// New York Stock Exchange only; the US book here is wider, by the pages.
//
// Fees ("Aranceles y comisiones"): "Contado 0,10% + IVA 1,00% + IVA"
// (minimum and maximum) and "Mandatos del exterior $50 + IVA 0,10% + IVA
// 1,00% + IVA"; "No hay comisión mínima de operaciones":
//   https://psec.com.ar/aranceles-y-comisiones.html
//
//   node brokers/psec/psec_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://psec.com.ar/productos/acciones.html", [/todas las acciones negociadas en Argentina y USA/i]);
await evidence("https://psec.com.ar/productos/nyse.html", [/todas las acciones negociadas en USA/i]);
await evidence("https://psec.com.ar/herramientas/preguntas-frecuentes.html", [/acciones y ETF que coticen en el NYSE/i]);
await evidence("https://psec.com.ar/aranceles-y-comisiones.html", [/Contado\s*0,10% \+ IVA\s*1,00% \+ IVA/, /Mandatos del exterior/]);

await bymaUs("PSEC (Prosecurities)", new URL("psec-parsed.json", import.meta.url), { cable: true });
