// What one round trip costs at Bancor (Banco de la Provincia de Córdoba
// S.A., "Bancor Inversiones"): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// from Bancón home banking ("Inversiones > Bonos y Acciones"). Lines in
// pesos and in MEP dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Comisiones cuenta de inversión" (June 2024 file, the
// one the bank links):
//   https://www.bancor.com.ar/assets-e2/uploads/cuenta_de_inversion_junio2024_c802974cb9.pdf
//   "Compra / Venta rueda Garantizada (o por cuenta y orden)": "Hasta 0,80%
//   Mín $200 por operación" in the "Sin Iva" column, "Hasta 0,80% Mín $242"
//   in the "Con IVA incluído" column (read by position on the page: the
//   row above, "Compra / Venta de Cartera Propia", is "s/c"; the rows below
//   are FCI / insurers "-" and "otros Mercados" 0,27%). Each side. "Hasta"
//   is a ceiling with no lower rate printed, so the figure is 0.80% (owner
//   rule: a discretionary range takes the max). The $200 minimum is pesos;
//   a dollar line takes its peso equivalent (fx.mjs) and it never binds on
//   a real order.
//   IVA: "Los importes consignados no incluyen el IVA ... que deberá
//   adicionarse": 21%, so 0.968% a side, at least $242.
//   Market rights: not on the sheet, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   Custody: "Custodia Valores Depositados en Caja de Valores 0,025% sobre
//   el saldo valuado a fin de mes Min $180" (+ IVA, $217.80): 0.30% a year,
//   in the remark. "Apertura/Mantenimiento de Cuenta Inversión $180"
//   (+ IVA $217.80), no period printed: about USD 0.14, left out.
//
// Formula, each side: max(0.80% × notional, $200) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: custody (remark), account opening / maintenance, certificates, statements and transfers
// (fixed charges, not the order), dividends (1%), the bank debit/credit tax
// (Ley 25.413), and BYMA's day-trade bonus on the post-trade part (under
// 0.01% a side; the figure assumes another day).
//
// Cash: "Es condición obligatoria para operar con valores negociables,
// contar con Cuentas a la Vista en Pesos y/o Dólares" (the sheet), and the
// product page asks to "Vincular cuenta en pesos y/o dólares a la cuenta
// inversión", so a line settles in its own currency and no FX enters the
// number; the MEP quote's half spread is the remark.
//   https://www.bancor.com.ar/personas/inversiones/compra-venta-de-valores-negociables
//
//   node brokers/bancor/bancor_cost.mjs GGAL BCBA ARS --shares=200 --price=7500
//   node brokers/bancor/bancor_cost.mjs SPY BCBA ARS --shares=70 --price=21500
//   node brokers/bancor/bancor_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bancor/bancor_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "bancor",
  name: "Bancor",
  catalogue: new URL("bancor-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.bancor.com.ar/assets-e2/uploads/cuenta_de_inversion_junio2024_c802974cb9.pdf",
    page: "https://www.bancor.com.ar/personas/inversiones/compra-venta-de-valores-negociables",
    readOn: "2026-10-26",
    inForce: "2024-06",
    entity: "Banco de la Provincia de Córdoba S.A. (Bancor Inversiones)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.008, minArs: 200 },
  vatOnCommission: true,
  basis: "rueda garantizada (por cuenta y orden) : jusqu'à 0,80 % + IVA par sens (maximum retenu), minimum 200 pesos + IVA ; droits BYMA 0,05 % + IVA",
  notes: ["garde 0,025 % par mois du solde valorisé, minimum 180 pesos + IVA, hors ordre"],
  remark: "Custody 0.30% a year (min 180 pesos a month) + VAT.",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
