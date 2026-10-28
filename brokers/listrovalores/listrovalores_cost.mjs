// What one round trip costs at Listro Valores (Listro Valores S.A.,
// Agente de Negociación n° 155 CNV, Rosario; Rosario Valores S.A. clears its
// trades, its "operar online - dma anima" link opens dma1.rosval.com.ar):
// buy n Buenos Aires shares or CEDEARs (ETF certificates included) at price
// p and sell them back, in dollars. Lines in pesos and in MEP dollars (D
// lines); the catalogue holds no cable (C) line.
//
// Read on 2026-10-26. "ARANCELES Y GASTOS PARA OPERATORIA DE MERCADO",
// updated "ENERO 2026" (the "Comisiones y Derechos de mercado" link of the
// home page):
//   https://img1.wsimg.com/blobby/go/048e81c1-c434-409c-8d68-42baebd015d1/cuadro%20gastos%20enero%202026.pdf
//   "Compra/Venta de Títulos Privados": "ARANCEL MAXIMO 1 % + IVA (mínimo
//   $ 50,- + IVA)", "ARANCEL AGENTE LIQUIDACION 0,2 % + IVA (mínimo $ 50,-
//   + IVA)", "DERECHOS DE MERCADO BYMA 0,05%+IVA", each side. The maximum
//   is taken (owner rule). The clearing agent's arancel is its own column
//   beside Listro's and is added to it: Listro is a negotiation agent
//   whose trades Rosario Valores clears. The BYMA column is BYMA's own
//   0.05% (the PDF's January 2026 overlay replaces the earlier 0,08%), so
//   the shared BYMA rights apply. Peso minimums are converted at fx.mjs's
//   peso rate on a D line. No same-session rate is printed.
//
// Formula, each side: (max(1% × notional, $50) + max(0.2% × notional,
// $50)) × 1.21 + 0.05% × notional × 1.21; plus the book, and a tax when
// taxMap.mjs names one (none on BYMA). Left out: "Mantenimiento de Cuenta
// Mensual: Sin costo para cuentas generales", dividends (0.5% + IVA),
// subscriptions, the MAV column (another market) and BYMA's day-trade
// bonus on the post-trade part.
//
// Cash: pesos and dollars. No page names the account's currencies; the
// broker sells the D lines, which settle in MEP dollars into the client
// account at its clearing agent Rosario Valores, so a line settles in its
// own currency and no FX enters the number; the MEP quote's half spread is
// the remark.
//
//   node brokers/listrovalores/listrovalores_cost.mjs GGAL BCBA ARS --shares=250 --price=6000
//   node brokers/listrovalores/listrovalores_cost.mjs AAPLD BCBA USD --shares=56 --price=17.90
//   node brokers/listrovalores/listrovalores_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bymaCostFile } from "../bancogalicia/bymaCost.mjs";

const AGENT = { rate: 0.01, minArs: 50 };
const CLEARING = { rate: 0.002, minArs: 50 };

const file = bymaCostFile({
  folder: "listrovalores",
  name: "Listro Valores",
  catalogue: new URL("listrovalores-parsed.json", import.meta.url),
  schedule: {
    url: "https://img1.wsimg.com/blobby/go/048e81c1-c434-409c-8d68-42baebd015d1/cuadro%20gastos%20enero%202026.pdf",
    page: "https://listrovalores.com/comisiones",
    readOn: "2026-10-26",
    inForce: "2026-01",
    entity: "Listro Valores S.A. (Agente de Negociación CNV n° 155)",
  },
  cash: ["ARS", "USD"],
  commission: ({ notional, currency, floorIn }) => {
    const agentMin = floorIn(AGENT.minArs, currency);
    const clearingMin = floorIn(CLEARING.minArs, currency);
    if (agentMin == null || clearingMin == null) return { fee: null, why: `pas de taux pour convertir le minimum en ${currency}` };
    const agent = Math.max(AGENT.rate * notional, agentMin);
    const clearing = Math.max(CLEARING.rate * notional, clearingMin);
    return {
      fee: agent + clearing,
      floorBites: agentMin > AGENT.rate * notional || clearingMin > CLEARING.rate * notional,
      note: "arancel Listro 1 % (min. 50 pesos) + arancel agent de liquidation 0,2 % (min. 50 pesos), avant IVA",
    };
  },
  vatOnCommission: true,
  basis: "titres privés : arancel maximum 1 % + IVA (minimum 50 pesos + IVA) plus arancel de l'agent de liquidation 0,2 % + IVA (minimum 50 pesos + IVA) par sens ; droits BYMA 0,05 % + IVA",
});

export const { roundTrip, SCHEDULE } = file;
file.printCli(import.meta.url);
