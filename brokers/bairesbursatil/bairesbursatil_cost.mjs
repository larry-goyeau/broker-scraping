// What one round trip costs at Baires Bursátil (Baires Bursátil S.A., ALyC
// n° 195 CNV, BYMA agent n° 60): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos and in MEP dollars (D lines); the catalogue holds no cable (C)
// line.
//
// Read on 2026-10-26. "Cuadros de Aranceles", "Vigencia de la presente
// Tabla de Aranceles y Comisiones: Desde el 01 de Diciembre 2024":
//   https://www.bairesbursatil.com.ar/aranceles.php
//   "Compra / Venta de Acciones | hasta 2.00% | +IVA | (minimo: $1000 +
//   IVA)", each side, one rate for every channel (the site's "HOME
//   BROKER" included). A discretionary "hasta" rate is taken at its max
//   (owner rule): 2% + 21% IVA = 2.42% a side, at least $1,210. The peso
//   minimum is converted at fx.mjs's peso rate on a D line. The page
//   prints no market rights line, so BYMA's own 0.05% + IVA applies
//   (../bancogalicia/bymaCost.mjs). No same-session rate is printed.
//
// Formula, each side: max(2% × notional, $1,000) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one
// (none on BYMA). Left out: "Custodia de Títulos / Mantenimiento de Cuenta
// $2000 + IVA" (a flat account fee, about USD 1.60), dividends and
// exchanges (up to 2.50% + IVA), transfers to other depositors ($50,000 +
// IVA), and BYMA's day-trade bonus on the post-trade part.
//
// Cash: pesos and dollars. No page names the account's currencies; the
// ALyC takes part in "las operatorias autorizadas por ... BYMA" and
// settles them itself, the MEP dollar (D) lines included, which credit
// dollars to the client account, so a line settles in its own currency and
// no FX enters the number; the MEP quote's half spread is the remark.
//   https://www.bairesbursatil.com.ar/servicios.php
//
//   node brokers/bairesbursatil/bairesbursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/bairesbursatil/bairesbursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/bairesbursatil/bairesbursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "bairesbursatil",
  name: "Baires Bursátil",
  catalogue: new URL("bairesbursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.bairesbursatil.com.ar/aranceles.php",
    readOn: "2026-10-26",
    inForce: "2024-12-01",
    entity: "Baires Bursátil S.A. (ALyC CNV n° 195)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 1000 },
  vatOnCommission: true,
  basis: "actions : jusqu'à 2,00 % + IVA par sens (maximum retenu), minimum 1 000 pesos + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
