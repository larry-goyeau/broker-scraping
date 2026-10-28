// What Veta Capital (Veta Capital S.A., Buenos Aires ALyC) sells in shares
// and exchange-traded funds, with no login. It publishes no list. Its
// shares page says:
//
//   https://www.vetacapital.com.ar/acciones
//   "usted tendrá acceso a todas las acciones negociadas en Argentina y USA,
//   pudiendo comprarlas y venderlas de forma muy simple. Puede realizar las
//   operaciones usted mismo desde nuestra plataforma web."
//
// Buenos Aires: BYMA's whole share and CEDEAR board (CEDEARs of US ETFs
// included; the tariff prices "CEDEARs Compra/venta"), read by
// ../bancogalicia/bymaBook.mjs: the peso, MEP dollar (D) and cable (C)
// lines of every local share and CEDEAR that BYMA quotes and that trades.
// Cable lines are kept: the tariff has a "Transferencia USD Cable" line.
// Block lines, closed-end funds, bond CEDEARs, rights, warrants and dormant
// or delisted lines are left out by the shared module.
//
// United States: "todas las acciones negociadas en ... USA", no exchange
// named and no exception, so the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, preferreds, closed-end
// funds and, as "all shares" of a place with no list keeps that place's
// ETFs, ETFs and ETNs, on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX
// and the Texas exchanges, less open trade halts, warrants, rights, units,
// when-issued lines and listed notes. OTC lines are not added. One row per
// title, in dollars.
//
// Fees (the "Aranceles y Comisiones" page prints its table as an image,
// "tabla comisiones para web (15 mayo 2023)"): "Acciones Compra/venta",
// "CEDEARs Compra/venta" $ 50 minimum, 1% through an adviser, 0,15% on the
// web; "Acciones exterior" $ 50, 1,50%, 0,75% on the web:
//   https://www.vetacapital.com.ar/aranceles-y-comisiones
//   https://static.wixstatic.com/media/135c82_9f1879735982404abbc085ce57aea5e6~mv2.png
//
//   node brokers/veta/veta_scraping.mjs

import { bymaUs, evidence } from "../bullmarket/bymaUs.mjs";

await evidence("https://www.vetacapital.com.ar/acciones", [/todas las acciones negociadas en Argentina y USA/i, /plataforma web/i]);
await evidence("https://www.vetacapital.com.ar/aranceles-y-comisiones", [/135c82_9f1879735982404abbc085ce57aea5e6/, /Aranceles y Comisiones/i]);

await bymaUs("Veta Capital", new URL("veta-parsed.json", import.meta.url), { cable: true });
