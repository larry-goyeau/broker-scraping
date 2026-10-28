// What one round trip costs at Integrar Inversiones (Integrar S.A., ALyC y
// AN Propio no. 261 at the CNV, Santa Fe): buy n Buenos Aires shares or
// CEDEARs (ETF certificates included) at price p and sell them back, in
// dollars, ordered on its Home Broker or app. Lines in pesos and in MEP
// dollars (D lines); no cable (C) line is written.
//
// Read on 2026-10-26. "ANEXO II - GRILLA COMISIONAL", "Vigencia: a partir
// del 1 de mayo de 2026":
//   https://integrarinversiones.com.ar/wp-content/uploads/ANEXO-II-ARANCELES-.pdf
//   "Acciones - Bonos - CEDEARs": "Por Mesa" Máximo 1.00%, Mínimo $300,00;
//   "Por Plataforma (HB o App)" Máximo 0,50%, Mínimo $300,00; each side.
//   "*Más IVA de corresponder. A los aranceles se les debe adicionar los
//   derechos y tasas de mercado, de corresponder." The grid prints
//   maximums ("continuará percibiendo las comisiones vigentes ... hasta
//   tanto la CNV autorice las comisiones máximas"), so the platform
//   maximum is the figure: 0.50% + IVA (0.605%) a side, at least $300 +
//   IVA ($363) a side. A dollar line takes the $300 floor at its dollar
//   equivalent (fx.mjs). The desk line is left out.
//   No rights line of its own: BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   "Mantenimiento mensual de cuenta sin costo", account opening free.
//   No same-session rate is printed.
//
// Formula, each side: max(0.50% × notional, $300) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: dividends (1.50%, minimum $1,000), transfers ($1,000 / USD
// 2.50 to 25), Caja de
// Valores transfers ($5,000 a species), and BYMA's day-trade bonus (the
// figure assumes another day).
//
// Cash: pesos and dollars (the MEP page buys dollars with the account's
// pesos and sells them back, and dollars are transferred in from the
// client's bank account), so a line settles in its own currency and no FX
// enters the number; the MEP quote's half spread is the remark.
//   https://integrarinversiones.com.ar/servicios/dolar-mep/
//
//   node brokers/integrarinversio/integrarinversio_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/integrarinversio/integrarinversio_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/integrarinversio/integrarinversio_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "integrarinversio",
  name: "Integrar Inversiones",
  catalogue: new URL("integrarinversio-parsed.json", import.meta.url),
  schedule: {
    url: "https://integrarinversiones.com.ar/wp-content/uploads/ANEXO-II-ARANCELES-.pdf",
    page: "https://integrarinversiones.com.ar/preguntas-frecuentes/",
    readOn: "2026-10-26",
    inForce: "2026-05-01",
    entity: "Integrar S.A. (ALyC y AN Propio n° 261)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.005, minArs: 300 },
  vatOnCommission: true,
  basis: "grille commissionnelle du 01/05/2026, plateforme (HB ou app) : maximum 0,50 % + IVA par sens, minimum 300 pesos + IVA ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
