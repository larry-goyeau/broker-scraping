// What one round trip costs at Aurum Valores (Aurum Valores S.A., ALyC y AN
// Propio n° 565 CNV): buy n Buenos Aires shares or CEDEARs (ETF
// certificates included) at price p and sell them back, in dollars, ordered
// on its online platforms (VirtualBroker clientes.aurum.com.ar, DMA
// dma.aurum.com.ar). Lines in pesos, MEP dollars (D lines) and cable dollars
// (C lines).
//
// Read on 2026-10-26. "Comisiones y aranceles" (the site footer's
// "Comisiones máximas" link):
//   https://aurum.com.ar/wp-content/uploads/2025/11/Cuadro-Tarifario-Aurum-2025-VF-1.pdf
//   "ARANCEL / COMISIÓN (MAXIMO)": "Compra/Venta de Acciones Hasta 1,50%
//   (mín. USD10 + IVA)", "Por operación"; "Compra/Venta de Acciones del
//   Exterior" the same. The "hasta" rate is taken at its max (owner rule):
//   1.50% a side, at least USD 10 a side, plus 21% IVA (1.815%, USD 12.10).
//   A peso line takes the USD 10 floor at its peso equivalent (fx.mjs); it
//   does not bind near USD 1,000 (1.50% = USD 15).
//   No rights line of its own: BYMA's 0.05% + IVA a side
//   (../bancogalicia/bymaCost.mjs, BYMA "Derechos de Mercado sobre
//   Operaciones", 2026-08-14):
//   https://cdn.prod.website-files.com/6697a441a50c6b926e1972e0/6a7f24c87e8bd58f712c02d1_BYMA-Derechos-Mercado-sobre-Operaciones_2026-08-14-vf.pdf
//   No same-session rate and no cable trade charge is printed.
//
// Formula, each side: max(1.50% × notional, USD 10) × 1.21 + 0.05% ×
// notional × 1.21; plus the book, and a tax when taxMap.mjs names one (none
// on BYMA).
// Left out: custody "0,34 x mil anual" (0.034% a year, not this order),
// CEDEAR conversion (USD 30 + agent costs), dividends, "Transferencia
// bancaria al exterior 50 USD", security transfers, and BYMA's day-trade
// bonus on the post-trade part (under 0.01% a side; the figure assumes
// another day).
//
// Cash: pesos and dollars (the site's deposit details: "Cuentas Corrientes
// Pesos: Banco de Valores ... aurum.pesos", "Cuentas Corrientes Dólares:
// Banco de Valores ... aurum.dolar"; "COMPRA Y VENTA DE DÓLAR MEP Y CCL"),
// so a line settles in its own currency and no FX enters the number; the
// MEP quote's half spread is the remark (the CCL quote on a C line).
//
//   node brokers/aurumvalores/aurumvalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/aurumvalores/aurumvalores_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/aurumvalores/aurumvalores_cost.mjs AAPLC BCBA USD --shares=56 --price=17.90
//   node brokers/aurumvalores/aurumvalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";
import { usdPer } from "../../fx.mjs";

const RATE = 0.015;
const MIN_USD = 10;

const file = bymaCostFile({
  folder: "aurumvalores",
  name: "Aurum Valores",
  catalogue: new URL("aurumvalores-parsed.json", import.meta.url),
  schedule: {
    url: "https://aurum.com.ar/wp-content/uploads/2025/11/Cuadro-Tarifario-Aurum-2025-VF-1.pdf",
    page: "https://aurum.com.ar/",
    readOn: "2026-10-26",
    inForce: "2025-11",
    entity: "Aurum Valores S.A. (ALyC y AN Propio n° 565)",
  },
  cash: ["ARS", "USD"],
  // One side, listing currency, before IVA: 1.50%, at least USD 10 (converted on a peso line).
  commission: ({ notional, currency }) => {
    const per = usdPer(currency);
    if (per == null) return { fee: null, why: `pas de taux pour convertir le minimum de 10 USD en ${currency}` };
    const floor = MIN_USD / per;
    const pct = notional * RATE;
    return { fee: Math.max(pct, floor), note: floor > pct ? "le minimum de 10 USD s'applique à cet ordre" : null };
  },
  vatOnCommission: true,
  basis: "« Comisiones y aranceles » : actions jusqu'à 1,50 % (maximum retenu), minimum 10 USD + IVA par opération et par sens ; droits BYMA 0,05 % + IVA",
  notes: ["garde 0,034 % par an laissée de côté"],
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
