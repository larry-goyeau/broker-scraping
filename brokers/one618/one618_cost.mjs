// What one round trip costs at ONE618 Financial Services (ex Consultatio
// Investments S.A., ALyC Integral CNV no. 44): buy n Buenos Aires shares or
// CEDEARs (the nine listed ETF certificates included) at price p and sell
// them back, in dollars, ordered from the app or the web. Lines in pesos,
// in MEP dollars (D lines) and in cable dollars (C lines).
//
// Read on 2026-10-26. "Tabla de comisiones Consultatio Investments S.A. a
// partir del 25/03/2022", on the fees page:
//   https://www.one618fs.com/honorarios
//   "ACCIONES Compra De 0 a 3%", "Venta De 0 a 3%", minimum "Pesos $300 o
//   Dólar US$ 20". A discretionary range is taken at its max (owner rule):
//   3% a side, at least $300 on a peso line and US$20 on a dollar line.
//   "A los aranceles arriba expuestos se le debe agregar el IVA
//   correspondiente" (exceptions are public bonds, ONs, trusts and short
//   notes): a share or CEDEAR fee takes 21% IVA, 3.63% a side.
//   "A los efectos de percibir aranceles por operaciones en moneda
//   extranjera, los mismos se cobraran en la moneda en la cual se realice
//   la operación": a D or C line is charged in dollars.
//   "no están incluídos aranceles costos e impuestos que se cobran por
//   cuenta y orden de los mercados": no rights figure printed, so BYMA's
//   0.05% + IVA a side (../bancogalicia/bymaCost.mjs, BYMA "Derechos de
//   Mercado sobre Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate is printed.
//
// Formula, each side: max(3% × notional, $300 or US$20) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA). Left out: "MANTEMINIMENTO DE CUENTA De $0 a $300" (at most
// about 20 US cents a month), dividends and exchanges (0 to 3% + Caja de
// Valores), and BYMA's day-trade bonus on the post-trade part.
//
// Cash: pesos and dollars (it sells "Dólar MEP" and "Dólar CCL", the latter
// settled to the client's account abroad, and prices cauciones "en pesos o
// dólares"; fees are charged in the trade's currency), so a line settles in
// its own currency and no FX enters the number; the MEP quote's half spread
// (CCL on a C line) is the remark.
//   https://www.one618fs.com/es/productos/otros-productos
//
//   node brokers/one618/one618_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/one618/one618_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/one618/one618_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/one618/one618_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "one618",
  name: "ONE618",
  catalogue: new URL("one618-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.one618fs.com/honorarios",
    page: "https://www.one618fs.com/es/productos/etfs-y-cedears",
    readOn: "2026-10-26",
    inForce: "2022-03-25",
    entity: "ONE618 Financial Services, ex Consultatio Investments S.A. (ALyC Integral CNV n° 44)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.03, minArs: 300, minUsd: 20 },
  vatOnCommission: true,
  basis: "actions : de 0 à 3 % + IVA par sens (maximum retenu), minimum 300 pesos ou 20 dollars + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
