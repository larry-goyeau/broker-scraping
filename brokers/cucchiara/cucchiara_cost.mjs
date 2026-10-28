// What one round trip costs at Cucchiara (Cucchiara y Cía. S.A., ALyC
// Integral n° 265 CNV, BYMA member n° 18): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered online (consultasonline / DMA platform). Lines in pesos
// and in MEP dollars (D lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Detalle de Aranceles y Comisiones" (no date
// printed), the "Aranceles y comisiones" link of the site footer, a public
// Adobe Acrobat share of "Comisiones Cucchiara - PARA EL SITIO (3).pdf":
//   https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:3da44e44-68a8-4a33-a4bc-6d4bab50dde1
//   "Compra - Venta de Acciones | Arancel Máximo 2,00% | Arancel Mínimo
//   $ 100", each side. The printed figure is a maximum, so the owner's rule
//   takes it: 2% with a 100-peso minimum. "A todos los aranceles habrá de
//   sumarle el Impuesto al Valor Agregado (IVA) en caso de corresponder":
//   21% IVA on a share commission. No market-rights line is printed, so
//   BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA "Derechos
//   de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Custodia de Títulos / Mantenimiento de cuenta $1000 Mensuales" + IVA:
//   about 0.8 USD a month, the remark. No same-session rate is printed.
//
// Formula, each side: max(2% × notional, $100) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// On a D line the 100-peso minimum is converted at fx.mjs's peso rate.
// Left out: custody (remark), dividends (2%), conversion (0.20 USD per
// ADR), transfers (USD 50 to a foreign depositary), and BYMA's day-trade
// bonus.
//
// Cash: pesos and dollars. "Cuentas habilitadas" lists the firm's
// "Cuentas corrientes operativas en PESOS" and "Cuentas corrientes
// operativas en Dólares" (Valores, Macro, Comafi, Santander), so a line
// settles in its own currency and no FX enters the number; the MEP quote's
// half spread is the remark.
//   https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:2c692a2e-89c1-46ae-8564-164dc07e3ac0
//
//   node brokers/cucchiara/cucchiara_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/cucchiara/cucchiara_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/cucchiara/cucchiara_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "cucchiara",
  name: "Cucchiara",
  catalogue: new URL("cucchiara-parsed.json", import.meta.url),
  schedule: {
    url: "https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:3da44e44-68a8-4a33-a4bc-6d4bab50dde1",
    page: "https://cucchiara.com.ar/",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Cucchiara y Cía. S.A. (ALyC Integral n° 265 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 100 },
  vatOnCommission: true,
  basis: "compra-venta de acciones : arancel máximo 2,00 % + IVA par sens (maximum retenu), minimum 100 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Custody 1,000 pesos a month + VAT.",
  notes: ["garde / tenue de compte 1 000 pesos par mois + IVA, hors ordre"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
