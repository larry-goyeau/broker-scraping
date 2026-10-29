// What one round trip costs at Bci Inversiones (Bci Corredor de Bolsa
// S.A.): buy n shares on the Bolsa de Santiago on Bci.cl and sell them back
// on another day, in dollars.
//
// Bci's share page says online orders get "una comisión más baja" than the
// other channels and prints no rate. Its share fact page, read on
// 2026-10-29, prints the tariff: "Comisión por Transacción: 1,5% + IVA
// Comisión mínima de Transacción: $ 18.000 + IVA Costo Operacional por
// Facturación (Diario si hay transacciones): $ 7.000 + IVA (Por día en que
// se opere) Costo de Custodia: Sin costo. Costo de Derechos de Bolsa: No se
// cobran."
//   https://www.bci.cl/inversiones/soluciones-de-inversion/acciones
//   http://www.bci.cl/empresarios/inversiones/acciones/conozcamassobreacciones.html
// That tariff is the ceiling of an online order, as for Bourse Brokers
// (owner's rule, 2026-10-28): each side max(1.5%, $18.000) + IVA, and
// $7.000 + IVA for each of the two days. The remark says online is lower,
// and gives the same-day cut (one daily charge).
//
// Cash: pesos only (deposits.mjs). A dollar line is converted at a rate the
// broker does not print, so its total stays unknown. The sums are in
// ../banchile/santiagoCost.mjs.
//
//   node brokers/bciinversiones/bciinversiones_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli, sameDayRemark } from "../banchile/santiagoCost.mjs";

const SCHEDULE = {
  broker: "Bci",
  folder: "bciinversiones",
  catalogueUrl: new URL("bciinversiones-parsed.json", import.meta.url),
  url: "http://www.bci.cl/empresarios/inversiones/acciones/conozcamassobreacciones.html",
  readOn: "2026-10-29",
  side: (clp) => Math.max(clp * 0.015, 18000),
  perDay: 7000,
  basis:
    "tarif imprimé (1,5 % par ordre, au moins 18 000 pesos, + 7 000 pesos par jour d'opérations, + IVA 19 %) pris comme plafond de l'ordre en ligne, moins cher mais non publié",
  remark: (ctx) => ["Online commission is lower; its rate is not published.", sameDayRemark(ctx)].join("\n"),
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
