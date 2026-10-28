// What one round trip costs at Aldazabal (Aldazabal y Cía. S.A., ALyC y
// AN Propio CNV no. 142, BYMA participant no. 1): buy n Buenos Aires shares
// or CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars. Lines in pesos and in MEP dollars (D lines); the catalogue holds
// no cable (C) line.
//
// Read on 2026-10-26. "Cuadro de Aranceles", "Tarifas vigentes desde Enero
// 2025":
//   https://www.aldazabal.com.ar/legales/cuadro-aranceles
//   "Compra/Venta de Acciones hasta 2,00% + IVA", "Mínimo: $300 + IVA",
//   each side. A discretionary "hasta" rate is taken at its max (owner
//   rule): 2% + 21% IVA = 2.42% a side, at least $363. The peso minimum is
//   converted at fx.mjs's peso rate on a D line. ("Acciones del Exterior",
//   minimum USD 10, is foreign shares, not a BYMA line.)
//   "Derechos de Mercado y Bolsa (Acciones) 0,0951% (IVA Incluido)", each
//   side: the broker's own rights line replaces BYMA's 0.05% + IVA.
//   No same-session rate is printed.
//
// Formula, each side: max(2% × notional, $300) × 1.21 + 0.0951% ×
// notional; plus the book, and a tax when taxMap.mjs names one (none on
// BYMA). Left out: "Custodia de Títulos $650 (IVA Inc.)" (about 43 US
// cents a month), dividends and exchanges (up to 3.5% + IVA), ADR
// conversion, and BYMA's day-trade bonus on the post-trade part.
//
// Cash: pesos and dollars (its bank accounts page lists a "Cuenta Corriente
// en Pesos" and a "Cuenta Corriente en Dólares" at Banco de Valores for
// client transfers), so a line settles in its own currency and no FX enters
// the number; the MEP quote's half spread is the remark.
//   https://www.aldazabal.com.ar/legales/cuentas-bancarias
//
//   node brokers/aldazabal/aldazabal_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/aldazabal/aldazabal_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/aldazabal/aldazabal_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "aldazabal",
  name: "Aldazabal",
  catalogue: new URL("aldazabal-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.aldazabal.com.ar/legales/cuadro-aranceles",
    readOn: "2026-10-26",
    inForce: "2025-01",
    entity: "Aldazabal y Cía. S.A. (ALyC y AN Propio CNV n° 142)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 300 },
  vatOnCommission: true,
  market: 0.000951,
  marketVat: false,
  basis: "actions : jusqu'à 2,00 % + IVA par sens (maximum retenu), minimum 300 pesos + IVA ; droits de marché du courtier 0,0951 % IVA compris",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
