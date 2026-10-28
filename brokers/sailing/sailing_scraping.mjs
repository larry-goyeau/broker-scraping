// What Sailing Inversiones (Sailing S.A., ALyC Propio n° 578 CNV) sells in
// shares and exchange-traded funds, with no login. Its pages say:
//
//   https://www.sailinginversiones.com/inversiones/cedears/
//   "En el siguiente link podes encontrar un listado de todos los Cedears
//   disponibles en el mercado argentino" (BYMA's CEDEAR table).
//   https://www.sailinginversiones.com/inversiones/acciones/
//   "Las acciones se compran y venden en la Bolsa de Valores (BYMA ...)."
//   "Los clientes de Sailing Inversiones pueden operar directamente en el
//   mercado desde la página web, la aplicación móvil o incluso vía correo
//   electrónico."
//   https://www.sailinginversiones.com/invertir-en-el-exterior/
//   "Sailing Internacional es la plataforma para invertir en el exterior.
//   Partiendo desde pesos o dólares en Argentina, podés comprar cualquier
//   activo que cotice en los mercados de EEUU"; "Se opera con la misma
//   cuenta comitente de Sailing".
//
// Buenos Aires: BYMA's whole share and CEDEAR board (the CEDEARs "disponibles
// en el mercado argentino", ETF certificates included), read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C) lines
// of every local share and CEDEAR that BYMA quotes and that trades. Cable
// lines are kept: the tariff has "Transferencias Internacionales de USD"
// and the same account holds US assets abroad. Block lines, closed-end
// funds, bond CEDEARs, rights, warrants and dormant or delisted lines are
// left out by the shared module.
//
// United States: "cualquier activo que cotice en los mercados de EEUU", no
// exchange named and no exception, so the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas exchanges, less open trade halts, warrants, rights, units,
// when-issued lines and listed notes. OTC lines are not added. One row per
// title, in dollars.
//
// Remark, not a removal: the page's "punto fuerte" abroad is a managed
// portfolio ("Cartera administrada").
//
// Fees ("Aranceles", maximums): "Acciones 1.00% + I.V.A.", "Cedears 1.00%
// + I.V.A."; no line names US trades:
//   https://www.sailinginversiones.com/operar/aranceles/
//
//   node brokers/sailing/sailing_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

const SITE = "https://www.sailinginversiones.com/";

await evidence(`${SITE}inversiones/cedears/`, [/listado de todos los Cedears disponibles en el mercado argentino/i]);
await evidence(`${SITE}inversiones/acciones/`, [/pueden operar directamente en el\s*mercado desde la página web/i]);
await evidence(`${SITE}invertir-en-el-exterior/`, [/cualquier activo que cotice en los mercados de EEUU/i, /misma cuenta comitente/i]);
await evidence(`${SITE}operar/aranceles/`, [/Acciones\s*1\.00% \+ I\.V\.A\./, /Cedears\s*1\.00% \+ I\.V\.A\./, /Transferencias Internacionales de USD/]);

await bymaUs("Sailing Inversiones", new URL("sailing-parsed.json", import.meta.url), { cable: true });
