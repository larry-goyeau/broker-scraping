// What one round trip costs at Arata (Arata S.A., ALyC y AN Propio n° 185
// CNV, BYMA agent n° 36): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from Arata's app. Lines in pesos and in MEP dollars (D lines); the
// catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "ARATA SOCIEDAD ANONIMA" tariff sheet (linked from the
// site footer, "Tabla de Aranceles"):
//   https://aratasa.com.ar/wp-content/uploads/2023/08/Aranceles-Arata-.-1-1-1.pdf
//   Renta Variable, "Contado": "Arancel Mínimo $ 100", "Mínimo % 0,10%",
//   "Máximo % 2,00%", each side. The sheet does not say which client pays
//   which rate, so the figure is the 2% ceiling (owner rule: a range takes
//   the max), as Cohen's identical sheet is. The $100 minimum is pesos; a
//   dollar line takes its peso equivalent (fx.mjs) and it never binds on a
//   real order. One schedule for every channel: no separate online rate.
//   IVA: the sheet prints none; a broker's commission on a share or a
//   CEDEAR bears 21% IVA in Argentina, as in ../cohen. Added, on the fee
//   the minimum sets as well.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//
// Formula, each side: max(2% × notional, $100) × 1.21 + 0.05% × notional ×
// 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: "Mantenimiento de cuenta $ 100,- por mes" and "Apertura de
// cuenta $ 100,-" (a few US cents), custody ("Se traslada costo de Caja de
// Valores S.A."), dividends ("Servicio de Acreencias" 0.10% to 2.00%), and
// BYMA's day-trade bonus on the post-trade part (under 0.01% a side; the
// figure assumes another day). Contado block (same rates) is not on the
// board. The 0.10% floor of the range is the remark: (2% - 0.10%) / 2% =
// 95% of the commission.
//
// Cash: pesos and dollars (the site trades "todos los productos del Mercado
// de Capitales, local y del exterior", which settle in dollars, and the
// catalogue's MEP lines), so a line settles in its own currency and no FX
// enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/arata/arata_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/arata/arata_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/arata/arata_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "arata",
  name: "Arata",
  catalogue: new URL("arata-parsed.json", import.meta.url),
  schedule: {
    url: "https://aratasa.com.ar/wp-content/uploads/2023/08/Aranceles-Arata-.-1-1-1.pdf",
    page: "https://aratasa.com.ar/",
    readOn: "2026-10-26",
    entity: "Arata S.A. (ALyC y AN Propio n° 185)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 100 },
  vatOnCommission: true,
  basis: "contado renta variable : 0,10 % à 2,00 % (maximum retenu) + IVA par sens, minimum 100 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Commission can be up to 95% lower.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
