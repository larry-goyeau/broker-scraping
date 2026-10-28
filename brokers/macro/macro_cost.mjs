// What one round trip costs at Macro Securities (Macro Securities S.A.U.,
// ALyC y AN Integral no. 59 at the CNV, the broker of Banco Macro): buy n
// Buenos Aires shares or CEDEARs (ETF certificates included) at price p and
// sell them back, in dollars. Lines in pesos and in MEP dollars (D lines);
// the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Tabla de Aranceles Indicativos":
//   https://www.macro.com.ar/macrosecurities/documento/1517351172498
//   "Compra/ Venta de Títulos Privados 1,00 %" and "Arancel Mínimo $ 5",
//   each side. Note (*): "Para un cálculo de costo total de cada
//   transacción, debe adicionarse: a) IVA en operaciones con títulos
//   privados, y b) los derechos de mercado": 1% + 21% IVA = 1.21% a side.
//   Note (**): "Los coeficientes indicados serán calculados en $ o U$S
//   según la moneda de la operación": a D line is charged in dollars; the
//   $5 minimum is converted at fx.mjs's peso rate and never binds on a
//   real order. The table prints no rights figure (the detail it says is
//   attached is not in the file), so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   One rate for every channel; no same-session rate is printed.
//
// Formula, each side: max(1% × notional, $5) × 1.21 + 0.05% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Custodia de Títulos (mensual) $ 15" (about one US cent),
// dividends (1%), and BYMA's day-trade bonus on the post-trade part (under
// 0.01% a side; the figure assumes another day).
//
// Cash: pesos and dollars (fees "en $ o U$S según la moneda de la
// operación"; Banco Macro's peso and dollar accounts), so a line settles in
// its own currency and no FX enters the number; the MEP quote's half spread
// is the remark.
//
//   node brokers/macro/macro_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/macro/macro_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/macro/macro_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "macro",
  name: "Macro Securities",
  catalogue: new URL("macro-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.macro.com.ar/macrosecurities/documento/1517351172498",
    page: "https://www.macro.com.ar/macrosecurities/intermediacion-bursatil",
    readOn: "2026-10-26",
    entity: "Macro Securities S.A.U. (ALyC y AN Integral n° 59)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 5 },
  vatOnCommission: true,
  basis: "titres privés : 1,00 % + IVA par sens, minimum 5 pesos + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
