// What one round trip costs at Five Corporation (Five Corporation S.A., ALyC
// integral n° 635 CNV, BYMA agent n° 66): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered online on "Home Broker Five". Lines in pesos and in MEP
// dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "LISTADO DE ARANCELES - ARANCELES, Comisiones y
// Recuperos (*) (**)", Resolución General CNV 616:
//   https://fivesa.com.ar/comisiones/
//   https://fivesa.com.ar/wp-content/uploads/2025/03/fivesa-comisiones-25.pdf
//   Renta variable, "Contado": "Arancel mínimo 0/2000", "Mínimo % 0",
//   "Máximo % 2.50", each side. Footnote: "Las operaciones efectuadas por
//   internet tendrán un arancel del 50% de los expuestos en este cuadro",
//   so online: up to 1.25%, minimum up to 1,000 pesos. Both are ranges
//   with no rule for who pays what, so the figure takes the max (owner
//   rule): 1.25% with a 1,000-peso minimum. A dollar line takes the peso
//   equivalent of the minimum (fx.mjs); it never binds on a real order.
//   IVA: the sheet prints "IVA SOBRE ARANCEL 21%" on its other lines and
//   nothing on the contado line; a broker's commission on a share or a
//   CEDEAR bears 21% IVA. Added, on the fee the minimum sets as well.
//   Market rights: footnote (*), "se le deberán sumar los derechos de
//   Mercado ... vigentes al momento de la operación", no figure printed,
//   so BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA
//   "Derechos de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   The 0% floor of the range is the remark: up to 100% lower.
//
// Formula, each side: max(1.25% × notional, $1,000) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: custody (Caja de Valores recovery, footnote (***)), account
// opening and maintenance (FAQ: "no cobramos costos de mantenimiento de
// cuenta"), dividends and transfers, and BYMA's day-trade bonus on the
// post-trade part (under 0.01% a side; the figure assumes another day).
// The adviser / phone desk pays the full table (2.50%, minimum up to 2,000
// pesos) and is not counted: an online line exists. Accounts opened on the
// Inviu platform pay Inviu's tariff, not this one.
//
// Cash: pesos and dollars (the catalogue's MEP lines; the tariff bills
// mandates abroad in "u$s"), so a line settles in its own currency and no
// FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/fivecorp/fivecorp_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/fivecorp/fivecorp_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/fivecorp/fivecorp_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "fivecorp",
  name: "Five Corporation",
  catalogue: new URL("fivecorp-parsed.json", import.meta.url),
  schedule: {
    url: "https://fivesa.com.ar/wp-content/uploads/2025/03/fivesa-comisiones-25.pdf",
    page: "https://fivesa.com.ar/comisiones/",
    readOn: "2026-10-26",
    entity: "Five Corporation S.A. (ALyC integral n° 635)",
  },
  cash: ["ARS", "USD"],
  // Internet: 50% of "Máximo % 2.50" and of "Arancel mínimo 0/2000".
  commission: { rate: 0.0125, minArs: 1000 },
  vatOnCommission: true,
  basis: "contado renta variable par internet : 50 % du barème, soit jusqu'à 1,25 % + IVA par sens (maximum retenu), minimum jusqu'à 1 000 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Commission can be up to 100% lower.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
