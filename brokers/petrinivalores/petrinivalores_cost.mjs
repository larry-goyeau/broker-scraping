// What one round trip costs at Petrini Valores (Petrini Valores S.A.,
// Córdoba; ALyC Propio y AN n° 85 CNV, member of BYMA, A3 and MAV): buy n
// Buenos Aires shares or CEDEARs (ETF certificates included) at price p and
// sell them back, in dollars, ordered online ("Acceso Clientes" / "Acceso
// DMA"). Lines in pesos, MEP dollars (D lines) and cable dollars (C lines).
//
// Read on 2026-10-26. "Cuadro de Aranceles y Gastos Vigentes", "Última
// Actualización: 21 de octubre, 2026":
//   https://www.petrini.com.ar/comisiones-y-aranceles/
//   "Compra / Venta de Acciones o Títulos de Deuda (Público/Privada) 2%
//   (**)", "(**) Mínimo $ 2.000", each side; "Para todos los casos los
//   aranceles por operación son máximos": the owner's rule takes the 2%.
//   "Las comisiones NO incluyen el IVA NI derechos de mercado": 21% IVA on
//   the commission, and market rights on top. No rights figure is printed,
//   so BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA
//   "Derechos de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   The "Acciones del exterior" row (2%, minimum U$S 200) is the foreign
//   market, not a BYMA CEDEAR. "Custodia de Valores: Acorde al Costo de
//   CV", "Cobro de custodia mínimo $750 más IVA": the remark. No
//   same-session rate and no per-execution cable charge is printed.
//
// Formula, each side: max(2% × notional, $2,000) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// On a D or C line the 2,000-peso minimum is converted at fx.mjs's peso
// rate. Left out: custody (remark), account opening (8 UVAs), dividends
// (2%), conversion (U$S 0.12 per ADR/CEDEAR), transfers (U$S 10 a dollar
// bank transfer, U$S 60 abroad, U$S 100 to a foreign depositary), and
// BYMA's day-trade bonus.
//
// Cash: pesos and dollars. The same table prices "Transferencia Bancarias
// en pesos", "Transferencia Bancarias en U$S", "Transferencias MEP" and
// "Transferencias Bancarias en el Exterior U$S 60", so a line settles in its
// own currency (cable dollars too) and no FX enters the number; the MEP
// quote's half spread is the remark, the CCL quote's on a C line.
//
//   node brokers/petrinivalores/petrinivalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/petrinivalores/petrinivalores_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/petrinivalores/petrinivalores_cost.mjs AAPLC BCBA USD --shares=60 --price=17
//   node brokers/petrinivalores/petrinivalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "petrinivalores",
  name: "Petrini Valores",
  catalogue: new URL("petrinivalores-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.petrini.com.ar/comisiones-y-aranceles/",
    readOn: "2026-10-26",
    inForce: "2026-10-21",
    entity: "Petrini Valores S.A. (ALyC Propio y AN n° 85 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.02, minArs: 2000 },
  vatOnCommission: true,
  basis: "compra / venta de acciones : 2 % maximum + IVA par sens, minimum 2 000 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Custody at least 750 pesos + VAT.",
  notes: ["aranceles « máximos » : règle du maximum", "garde au coût Caja de Valores, minimum 750 pesos + IVA, hors ordre"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
