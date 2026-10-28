// What one round trip costs at Banco Patagonia (Banco Patagonia S.A., ALyC
// y AN Integral no. 66 at the CNV): buy n Buenos Aires shares or CEDEARs
// (ETF certificates included) at price p and sell them back, in dollars,
// ordered online from Patagonia eBank or Patagonia Móvil ("Operar CEDEARs,
// Bonos y Acciones"). Lines in pesos and in MEP dollars (D lines); C lines
// are "no habilitados para operar por la plataforma".
//
// Read on 2026-10-26. "Comisiones y cargos de Títulos Valores", form
// 07.0003, "VIGENCIA 16/09/2024" (the newest securities table on the
// bank's site):
//   https://bancopatagonia.com.ar/comisiones/docs/Titulos_Valores.pdf
//   "Compra - Venta de Títulos / Acciones (**) 1,00% $ 1.000,00 Sobre el
//   monto de la operación"; "(**) Los aranceles, cargos y derechos de
//   mercado serán trasladados al cliente, según se incurran"; "A los
//   importes mencionados precedentemente deberá adicionarse el I.V.A.
//   correspondiente". So 1% with a 1,000-peso minimum, + 21% IVA, each
//   side; on a D line the minimum is converted at fx.mjs's peso rate. No
//   rights figure is printed, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   The older MAE table the company page links prices the same contado
//   private securities at "1%" with a $15 minimum:
//   https://www.bancopatagonia.com.ar/personas/pdf/comisiones.pdf
//   Holding cost, same 2024 table, + IVA: "Mantenimiento de Cuenta
//   Comitente $ 1.000,00 Mensual", custody 0.50% a year (TNA) under
//   $500,000 held, 0.40% to $1,000,000, 0.30% above, minimum $1,000 a month.
//   About 1.3 USD a month together on a 1,000 USD holding: the remark.
//   No same-session rate is printed.
//
// Formula, each side: max(1% × notional, $1,000) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// Left out: the $1,000 account opening, dividends (1% + Caja de Valores),
// transfers, and BYMA's day-trade bonus.
//
// Cash: pesos and dollars (the FAQ: "para operar un activo con dólares
// deberás seleccionar un ticker finalizado con la letra 'D'", settled from
// the client's dollar account), so a line settles in its own currency and
// no FX enters the number; the MEP quote's half spread is the remark.
//
//   node brokers/bancopatagonia/bancopatagonia_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bancopatagonia/bancopatagonia_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bancopatagonia/bancopatagonia_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "bancopatagonia",
  name: "Banco Patagonia",
  catalogue: new URL("bancopatagonia-parsed.json", import.meta.url),
  schedule: {
    url: "https://bancopatagonia.com.ar/comisiones/docs/Titulos_Valores.pdf",
    page: "https://www.bancopatagonia.com.ar/empresas/inversiones/compra-venta-titulos-acciones.php",
    readOn: "2026-10-26",
    inForce: "2024-09-16",
    entity: "Banco Patagonia S.A. (ALyC y AN Integral n° 66)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.01, minArs: 1000 },
  vatOnCommission: true,
  basis: "titres / actions : 1,00 % + IVA par sens, minimum 1 000 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Custody 0.30% to 0.50% a year (min 1,000 pesos a month) plus 1,000 pesos a month account fee, + VAT.",
  notes: ["garde 0,30-0,50 % l'an (min. 1 000 pesos/mois) et tenue de compte 1 000 pesos/mois, + IVA, hors ordre"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
