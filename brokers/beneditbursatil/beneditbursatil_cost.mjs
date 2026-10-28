// What one round trip costs at Benedit Bursátil (Benedit Bursátil S.A.,
// ALyC y AN Propio n° 271 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos, MEP dollars (D lines) and cable dollars (C lines).
//
// Read on 2026-10-26. "ARANCELES, GASTOS E IMPUESTOS" (file
// Comisiones-NOVIEMBRE-2025.pdf, linked from the home page):
//   https://beneditsa.com.ar/sites/default/files/descargas/Comisiones-NOVIEMBRE-2025.pdf
//   "Compra/Venta - Contado /plazo Valores Negociables Privados
//   (ON/Acciones/cupones/certificados) en segmento PPT": Mínimo "$500/U$S
//   2,50", Máximo "1,5%", each side. The sheet prints only the ceiling
//   ("bonificaciones ... sin exceder los máximos definidos"), so the
//   figure is 1.5% (owner rule: take the max). The minimum is $500 on a
//   peso line and USD 2.50 on a dollar line ("Los Aranceles serán cobrados
//   en la misma moneda en la cual se realizó la operación"); neither binds
//   on a real order. One schedule for every channel: no separate online
//   rate.
//   IVA: "Sobre los importes que resulten de la aplicación de los
//   Aranceles ... se adicionará el IVA cuando corresponda": 21% on a share
//   or a CEDEAR commission, on the fee the minimum sets as well.
//   Market rights: "se cobrarán los derechos y/u otros cargos conforme la
//   normativa aplicable del mercado ... (más IVA, cuando corresponda)", no
//   figure printed, so BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//
// Formula, each side: max(1.5% × notional, $500 or USD 2.50) × 1.21 +
// 0.05% × notional × 1.21; plus the book, and a tax when taxMap.mjs names
// one (none on BYMA).
// Left out: custody ("Recupero arancel de custodia de Caja de Valores"),
// "Mantenimiento de Cuenta Sin Cargo", dividends ($200 / 1.5%), CEDEAR
// conversion, transfers ("Recepción/transferencia de dólares en las cuentas
// monetarias de Benedit en el exterior U$S 40", a cable transfer, not a
// trade), and BYMA's day-trade bonus on the post-trade part (under 0.01% a
// side; the figure assumes another day). No same-session waiver is printed.
//
// Cash: pesos and dollars ("Negociación en moneda local y extranjera" on
// the products page; dollar minimums and dollar accounts abroad on the
// tariff), so a line settles in its own currency and no FX enters the
// number; the MEP quote's half spread is the remark (the CCL quote on a
// cable line).
//   https://www.beneditsa.com.ar/productos
//
//   node brokers/beneditbursatil/beneditbursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/beneditbursatil/beneditbursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/beneditbursatil/beneditbursatil_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/beneditbursatil/beneditbursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "beneditbursatil",
  name: "Benedit Bursátil",
  catalogue: new URL("beneditbursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://beneditsa.com.ar/sites/default/files/descargas/Comisiones-NOVIEMBRE-2025.pdf",
    page: "https://www.beneditsa.com.ar/",
    readOn: "2026-10-26",
    inForce: "2025-11",
    entity: "Benedit Bursátil S.A. (ALyC y AN Propio n° 271)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.015, minArs: 500, minUsd: 2.5 },
  vatOnCommission: true,
  basis: "valeurs privées segment PPT : jusqu'à 1,5 % + IVA par sens (maximum retenu), minimum 500 pesos / 2,50 USD + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
