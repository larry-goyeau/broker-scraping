// What IEB+ (the app of Invertir en Bolsa S.A., ALyC y AN Integral n° 246
// CNV, BYMA agent n° 203, MAV n° 546) sells in shares and exchange-traded
// funds, with no login. It publishes no list. Its FAQ says:
//
//   https://www.iebmas.com.ar/preguntas-frecuentes/
//   Plan Investor: "operar sin comisiones y de forma ilimitada todos los
//   instrumentos del mercado local" (a membership of $5.000 + IVA in a month
//   with a trade in "Acciones, Bonos, Cauciones, CEDEARs, ONs, Letras, y
//   Opciones").
//   Plan Global: "sumale acceso full al mercado de USA: Acciones, ETFs,
//   ADRs, ETNs, y ETVs. ¡Todo sin comisiones y de forma ilimitada!"
//   (a membership of USD 15 + IVA in a month with an international trade).
//   "En la plataforma web de IEB+ vas a poder operar tanto en el mercado
//   local como en el mercado internacional".
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included), read by ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D)
// and cable (C) lines of every local share and CEDEAR that BYMA quotes and
// that trades. Cable lines are kept: the app has a "Botonera CCL (BYMA)" and
// funds US trades with "Dólares EXT". Block lines, closed-end funds, bond
// CEDEARs, rights, warrants and dormant or delisted lines are left out by
// the shared module. broker-list.json also names MAV, which has no share
// board of its own in open data; no MAV row is written.
//
// United States: "acceso full", no exchange named and no exception, so the
// whole US exchange book of the day (../wellstrade/usBook.mjs): shares,
// ADRs, REITs, preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE,
// NYSE American, NYSE Arca, Cboe BZX and the Texas exchanges, less open
// trade halts, warrants, rights, units, when-issued lines and listed notes.
// OTC lines are not added. One row per title, in dollars.
//
// Remark, not a removal (the broker-list restriction, checked on the FAQ):
// US trades need the Global plan, USD 15 + IVA in each month with a US
// trade; "en USA vas a poder operar únicamente en plazo 24hs".
//
// Fees: no commission ("Las comisiones para operar con nosotros son
// cero"), the monthly memberships above, and BYMA's market fees ("CEDEAR
// 0,05% (0,03% Negociacion + 0,02% Post-Trade) + IVA"), same FAQ.
//
//   node brokers/ieb/ieb_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.iebmas.com.ar/preguntas-frecuentes/", [
  /todos los instrumentos del mercado local/i,
  /acceso full al mercado de USA: Acciones, ETFs, ADRs, ETNs, y ETVs/i,
  /USD 15 \+ IVA/,
  /Las comisiones para operar con nosotros son cero/i,
  /Botonera CCL/i,
]);

await bymaUs("IEB+", new URL("ieb-parsed.json", import.meta.url), { cable: true });
