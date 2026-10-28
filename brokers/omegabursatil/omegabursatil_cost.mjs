// What one round trip costs at Omega Bursátil (Omega Bursatil S.A., Agente
// de Negociación n° 636 CNV; Rosario Valores S.A., ALyC Integral n° 39,
// clears its trades): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars. Lines
// in pesos, in MEP dollars (D lines) and in cable dollars (C lines).
//
// Read on 2026-10-26. "Tabla de aranceles (Jun 2026)", the "Aranceles"
// link of the products page:
//   https://www.omegabursatil.com/_files/ugd/71fa66_18fe373342ba40e9883876c5efcbe124.pdf
//   "Aranceles Maximos (1)", "Contado / Privado": "General 3,00%",
//   "Online 0,25%"; "(1) Incluye aranceles de Omega Bursatil y de ROSVAL";
//   "Arancel Mínimo por operación: AR$ 0.00"; "Derechos de mercado Bs.As.
//   0,08%"; "A los porcentajes arriba indicados, se le debe agregar el IVA
//   correspondiente" (public bonds, ONs and letras excepted). Each side.
//   The online line is the one used: the FAQ says a client trades "desde
//   su plataforma online" (the General line is the adviser's). Its
//   maximum is taken (owner rule). The broker prints its own Buenos Aires
//   rights line, 0.08% + IVA, which replaces BYMA's 0.05% + IVA. No
//   same-session rate is printed, and no fixed charge on a cable trade.
//
// Formula, each side: 0.25% × notional × 1.21 + 0.08% × notional × 1.21;
// plus the book, and a tax when taxMap.mjs names one (none on BYMA). Left
// out: "Instrumentos del mercado internacional" (a foreign market) and
// BYMA's day-trade bonus on the post-trade part. The table prints no
// custody or account fee.
//
// Cash: pesos and dollars. The products page lists "Dolar Mep" and "Dolar
// CCL", so a line settles in its own currency and no FX enters the number;
// the MEP quote's half spread is the remark (the CCL quote's on a C line).
//   https://www.omegabursatil.com/productos
//   https://www.omegabursatil.com/preguntas-frecuentes
//
//   node brokers/omegabursatil/omegabursatil_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/omegabursatil/omegabursatil_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/omegabursatil/omegabursatil_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/omegabursatil/omegabursatil_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const file = bymaCostFile({
  folder: "omegabursatil",
  name: "Omega Bursátil",
  catalogue: new URL("omegabursatil-parsed.json", import.meta.url),
  schedule: {
    url: "https://www.omegabursatil.com/_files/ugd/71fa66_18fe373342ba40e9883876c5efcbe124.pdf",
    page: "https://www.omegabursatil.com/productos",
    readOn: "2026-10-26",
    inForce: "2026-06",
    entity: "Omega Bursatil S.A. (AN CNV n° 636), Rosario Valores S.A. (ALyC Integral CNV n° 39)",
  },
  cash: ["ARS", "USD"],
  commission: { rate: 0.0025, minArs: 0 },
  vatOnCommission: true,
  market: 0.0008,
  marketVat: true,
  basis: "contado privé, canal en ligne : arancel maximum 0,25 % + IVA par sens (Omega et ROSVAL compris), minimum 0 ; droits de marché Buenos Aires imprimés par le courtier 0,08 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
