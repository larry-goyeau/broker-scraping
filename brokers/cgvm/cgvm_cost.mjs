// What one round trip costs at CGVM (Compañía General de Valores
// Mobiliarios S.A., ALyC y AN n° 182 CNV, member of BYMA): buy n Buenos
// Aires shares or CEDEARs (ETF certificates included) at price p and sell
// them back, in dollars, ordered online (Home Broker or the CGVM app,
// "Compra y venta al instante"). Lines in pesos and in MEP dollars (D
// lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "Aranceles" (no date printed), linked from the home
// page's footer:
//   https://www.cgvm.com.ar/files/aranceles.pdf
//   RENTA VARIABLE, "Contado": "Arancel MINIMO $ 50 | % MINIMO 0,50% |
//   % MAXIMO 3,00%", each side. A range, so the owner's rule takes the top:
//   3% with a 50-peso minimum. "Todos los Conceptos son + IVA de
//   corresponder": 21% IVA on the commission. "Las Operaciones son +
//   Derechos de Bolsa y de Mercado vigentes": no figure is printed, so
//   BYMA's 0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA "Derechos
//   de Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "NO SE COBRA POR APERTURA DE CUENTA NO SE COBRA MANTENIMIENTO DE
//   CUENTA". No same-session rate is printed.
//
// Formula, each side: max(3% × notional, $50) × 1.21 + 0.05% × notional
// × 1.21; plus the book, and a tax when taxMap.mjs names one (none on BYMA).
// On a D line the 50-peso minimum is converted at fx.mjs's peso rate.
// Left out: custody ("Servicios de Custodia", renta variable 0.10% to
// 1.00% + Caja de Valores costs, period not printed: the remark, with the
// commission range: (3% - 0.50%) / 3% = 83% of the commission), dividends
// (0.50% to 1.50%), transfers ($100 to $200), and BYMA's day-trade bonus.
//
// Cash: pesos and dollars. Neither the site nor the table names a dollar
// account in words; the catalogue's D lines (shares and CEDEARs that settle
// in MEP dollars in the client's account) are what the broker sells, so a
// line settles in its own currency and no FX enters the number; the MEP
// quote's half spread is the remark.
//
//   node brokers/cgvm/cgvm_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/cgvm/cgvm_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/cgvm/cgvm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "cgvm",
  name: "CGVM",
  catalogue: new URL("cgvm-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.cgvm.com.ar/files/aranceles.pdf",
    page: "https://www.cgvm.com.ar/",
    readOn: "2026-10-26",
    inForce: "",
    entity: "Compañía General de Valores Mobiliarios S.A. (ALyC y AN n° 182 CNV)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.03, minArs: 50 },
  vatOnCommission: true,
  basis: "renta variable contado : 0,50 % à 3,00 % + IVA par sens (3 % retenu), minimum 50 pesos + IVA ; droits BYMA 0,05 % + IVA",
  remark: "Commission can be up to 83% lower. Custody up to 1% + VAT.",
  notes: ["fourchette 0,50-3,00 % : règle du maximum", "garde 0,10 % à 1,00 % + IVA (période non indiquée), hors ordre"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
