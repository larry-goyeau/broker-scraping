// What one round trip costs at SJB ("SJB Finanzas Expertas", SJB S.A., ALyC
// y AN Propio n° 342 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos, MEP dollars (D lines) and cable dollars (C lines).
//
// Read on 2026-10-26. "Tabla de aranceles" dated 14/11/2022 (linked from
// the FAQ and the "Información legal" page; no newer sheet is linked):
//   https://www.sjb.com.ar/wp-content/uploads/2022/11/TABLA-DE-ARANCELES-SJB-2022.11.14.pdf
//   De Mercado Secundario, "Contado - Renta variable": "Arancel Máximo
//   Porcentaje 2", "Monto Mínimo en pesos 100,00", each side; "Contado -
//   Exterior" (the cable leg) has the same 2% and 100. Only the ceiling is
//   printed, so the figure is 2% (owner rule: take the max). The minimum
//   is pesos; a dollar line takes its peso equivalent (fx.mjs) and it never
//   binds on a real order. "Los aranceles se cobran en moneda original de
//   la operación." One schedule for every channel: no separate online rate.
//   IVA: "A los valores resultantes de aplicar los porcentajes antes
//   indicados se les debe agregar el IVA": 21% on a share or a CEDEAR
//   commission, on the fee the minimum sets as well.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//
// Formula, each side: max(2% × notional, $100) × 1.21 + 0.05% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Mantenimiento de cuenta 200,00 arancel fijo" (about thirteen
// US cents), dividends (2.5%, minimum 10), transfers of securities abroad
// (USD 35), and BYMA's day-trade bonus on the post-trade part (under 0.01%
// a side; the figure assumes another day). No same-session waiver is
// printed.
//
// Cash: pesos and dollars. FAQ "¿Cómo deposito dinero en mi cuenta
// comitente?": a Banco Comafi "PESOS" account and a Banco Comafi "DOLARES"
// account; the FAQ also offers "Dólar MEP y Dólar CCL". A line settles in
// its own currency and no FX enters the number; the MEP quote's half spread
// is the remark (the CCL quote on a cable line).
//   https://www.sjb.com.ar/preguntas-frecuentes/
//
//   node brokers/sjbbursatil/sjbbursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/sjbbursatil/sjbbursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/sjbbursatil/sjbbursatil_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/sjbbursatil/sjbbursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "sjbbursatil",
  name: "SJB",
  catalogue: new URL("sjbbursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.sjb.com.ar/wp-content/uploads/2022/11/TABLA-DE-ARANCELES-SJB-2022.11.14.pdf",
    page: "https://www.sjb.com.ar/preguntas-frecuentes/",
    readOn: "2026-10-26",
    inForce: "2022-11-14",
    entity: "SJB S.A. (ALyC y AN Propio n° 342)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 100 },
  vatOnCommission: true,
  basis: "contado renta variable : jusqu'à 2 % + IVA par sens (maximum retenu), minimum 100 pesos + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
