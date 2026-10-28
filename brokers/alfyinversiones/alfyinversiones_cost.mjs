// What one round trip costs at Alfy Inversiones (Alfy Inversiones S.A.,
// ALyC Propio no. 176 at the CNV, Buenos Aires): buy n Buenos Aires shares
// or CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered on its web platform or app ("Invertí 100% online").
// Lines in pesos, in MEP dollars (D lines) and in cable dollars (C lines).
//
// Read on 2026-10-26. "Regulaciones y aranceles", table "Aranceles":
//   https://alfyinversiones.com.ar/regulaciones-y-aranceles/
//   "Producto / Arancel WEB / Mínimo": "Acciones 0,40% $200", "Cedears
//   0,40% $200", each side.
//   "Tabla de aranceles completa" (linked from the same page):
//   https://drive.google.com/file/d/1xuxfRQZFiKkrTzL6ImdAhbK9qRmbxlR_/view
//   "TABLA DE ARANCELES Y COMISIONES VIGENTES - ALFY INVERSIONES SA":
//   "** LOS ARANCELES NO INCLUYEN IVA NI IMP/DERECHOS DE MERCADO"; COMPRA /
//   VENTA PRIVADO and CEDEAR "Maximo % 1,00", "Arancel Minimo $ 200,00".
//   The 1% is the ceiling of the full grid; the web channel's own rate is
//   0.40%, so 0.40% + IVA (0.484%) a side, at least $200 + IVA ($242) a
//   side. A dollar line takes the $200 floor at its dollar equivalent
//   (fx.mjs); it never binds near USD 1,000.
//   No rights line of its own: BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "COMPRA TRADING / VENTA TRADING" carry the same 1% ceiling: no
//   same-session discount. The account is "sin costo de apertura ni
//   mantenimiento". No cable fee is printed.
//
// Formula, each side: max(0.40% × notional, $200) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: dividends (2%, minimum $200), transfers ("A CONSULTAR"), and
// BYMA's day-trade bonus on the post-trade part (under 0.01% a side; the
// figure assumes another day).
//
// Cash: pesos and dollars ("las acciones se negocian principalmente en
// pesos, aunque también es posible operarlas en dólares"; the MEP page
// buys and sells dollars in the account, and CEDEAR dividends "se abonan
// en dólar cable"), so a line settles in its own currency and no FX enters
// the number; the MEP quote's half spread (CCL on a C line) is the remark.
//
//   node brokers/alfyinversiones/alfyinversiones_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/alfyinversiones/alfyinversiones_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/alfyinversiones/alfyinversiones_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/alfyinversiones/alfyinversiones_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "alfyinversiones",
  name: "Alfy Inversiones",
  catalogue: new URL("alfyinversiones-parsed.json", import.meta.url),
  schedule: {
    url: "https://alfyinversiones.com.ar/regulaciones-y-aranceles/",
    page: "https://drive.google.com/file/d/1xuxfRQZFiKkrTzL6ImdAhbK9qRmbxlR_/view",
    readOn: "2026-10-26",
    entity: "Alfy Inversiones S.A. (ALyC Propio n° 176)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.004, minArs: 200 },
  vatOnCommission: true,
  basis: "arancel WEB : 0,40 % + IVA par sens, minimum 200 pesos + IVA (tableau complet : tarifs hors IVA et hors droits) ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
