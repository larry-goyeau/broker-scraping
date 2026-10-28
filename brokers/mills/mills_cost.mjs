// What one round trip costs at Mills Capital (Mills Capital Markets S.A.,
// ALyC y AN Propio n° 249 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars,
// ordered on its Home Broker or the Matriz OMS screen. Lines in pesos, MEP
// dollars (D lines) and cable dollars (C lines).
//
// Read on 2026-10-26. "Comisiones, aranceles y gastos – anexo B" (file dated
// 2026-05-15), one sheet for every channel:
//   https://mills-storage.nyc3.cdn.digitaloceanspaces.com/media/documents/MCM_Comisiones.pdf
//   Compra / Venta       "MÁXIMO Hasta 3%", "MÍNIMO 0,35% + IVA", each side.
//   Acciones             The sheet does not say which client pays which
//                        rate, so the figure is the 3% ceiling (owner's
//                        rule, as Cohen's, LDT's and GIO's are), plus 21%
//                        IVA (the minimum is "+ IVA", and a broker's
//                        commission on a share bears IVA): 3.63% a side.
//                        The 0.35% floor is the remark: 88% under
//                        the 3% ((3 - 0.35) / 3).
//   Market rights        "A las comisiones expuestas previamente se le
//                        deberán adicionar los derechos de los Mercados":
//                        BYMA's August 2026 table, contado PPT, 0.05% on a
//                        private share or a CEDEAR, each side, plus IVA
//                        (../bancogalicia/bymaCost.mjs).
//   Custody              "Administración y Custodia en Caja De Valores
//                        0,50%", period not stated: sizeable, so in the
//                        remark.
//   Left out             "Compra / Venta Acciones Exterior" (orders abroad),
//                        dividends "Hasta 2%", "Transferencias
//                        internacionales a depositarias en el Exterior Hasta
//                        US$50 por especie", CEDEAR conversion: not this
//                        order. "Mantenimiento de Cuenta —". No same-session
//                        rate is printed.
//
// Formula, each side: 3% × notional × 1.21 + 0.05% × notional × 1.21, plus
// the book (spreads/byma-touch.mjs) and a tax when taxMap.mjs names one.
//
// Cash: pesos and dollars. The broker trades "Dólar MEP / CCL", and "Las
// comisiones previamente detalladas podrán ser percibidas en la moneda de
// pago y/o cobro de cada operación", so a line settles in its own currency
// and no FX enters the number; the remark is the MEP quote (the CCL quote
// on a C line).
//   https://mills.capital/servicios/inversion-financiera/
//
//   node brokers/mills/mills_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/mills/mills_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/mills/mills_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/mills/mills_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "mills",
  name: "Mills Capital",
  catalogue: new URL("mills-parsed.json", import.meta.url),
  schedule: {
    url: "https://mills-storage.nyc3.cdn.digitaloceanspaces.com/media/documents/MCM_Comisiones.pdf",
    page: "https://mills.capital/servicios/inversion-financiera/",
    readOn: "2026-10-26",
    inForce: "2026-05-15",
    entity: "Mills Capital Markets S.A. (ALyC y AN Propio n° 249 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.03 },
  vatOnCommission: true,
  basis:
    "« Comisiones, aranceles y gastos – anexo B » (2026-05-15), relu le 2026-10-26 : compra / venta acciones « Hasta 3% » (plafond retenu, " +
    "règle du maximum), minimum 0,35 % + IVA, IVA 21 % par sens ; droits de marché BYMA 0,05 % + IVA par sens",
  remark: "Commission can be up to 88% lower; the sheet does not say when. Custody 0.50%.",
  notes: ["garde Caja de Valores 0,50 % sans période : hors calcul, en remarque"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
