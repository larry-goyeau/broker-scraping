// What one round trip costs at Fernández Laya (Fernández Laya S.A., ALyC y
// AN Propio n° 118 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from its online platform ("Operar Online", operar.fernandezlaya.com.ar).
// Lines in pesos and in MEP dollars (D lines); the broker writes no cable
// (C) line.
//
// Read on 2026-10-26. "Tabla de Comisiones" (scanned, signed sheet, file
// name "hoja de aranceles actualizada noviembre 2025"; the footer's
// "Aranceles" link):
//   https://www.fernandezlaya.com.ar/downloads/hoja-de-aranceles-actualizada-noviembre-2025-2662.pdf
//   "Aranceles por operaciones": "Acciones, Cedears Cpra /Vta" "1,00 %",
//   Mínimo "$ 100", each side. One price for every channel.
//   "*Se sumaran los Derechos de Mercado correspondientes aclarados en el
//   Anexo I": the annex is not published, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "*En caso que corresponda se adicionará el Impuesto al Valor Agregado
//   (IVA)": commission is IVA-taxable, so 21% is added, on the fee the
//   minimum sets as well.
//   No same-session rate is printed.
//
// Formula, each side: max(1% × notional, 100 pesos) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA). A dollar line takes the peso equivalent of the minimum.
// Left out: "Mantenimiento de cuenta $ 2500" (period not printed; under
// USD 2), "Custodia Caja de Valores cobro mensual" (the Caja de Valores
// charge passed on, minimum $ 50 a month), dividends (1.50%, minimum
// $ 100), transfers, ADR conversion, and BYMA's day-trade bonus (the figure
// assumes another day).
//
// Cash: pesos and dollars. The sheet prices "Transferencias Bancaria
// emisora en pesos" ($ 500) and "Transferencias Bancaria emisora en
// dólares" (U$S 25), so the account pays out both; a line settles in its
// own currency and no FX enters the number; the MEP quote's half spread is
// the remark.
//
//   node brokers/fernandezlaya/fernandezlaya_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/fernandezlaya/fernandezlaya_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/fernandezlaya/fernandezlaya_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "fernandezlaya",
  name: "Fernández Laya",
  catalogue: new URL("fernandezlaya-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.fernandezlaya.com.ar/downloads/hoja-de-aranceles-actualizada-noviembre-2025-2662.pdf",
    page: "https://www.fernandezlaya.com.ar/",
    readOn: "2026-10-26",
    inForce: "2025-11",
    entity: "Fernández Laya S.A. (ALyC y AN Propio n° 118)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 100 },
  vatOnCommission: true,
  basis: "actions, CEDEARs : 1,00 % par sens, minimum 100 pesos, + IVA 21 % ; droits BYMA 0,05 % + IVA (annexe I du courtier non publiée)",
  notes: ["droits de marché : barème BYMA, l'annexe du courtier n'étant pas publiée"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
