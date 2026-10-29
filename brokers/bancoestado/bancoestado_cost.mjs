// What one round trip costs at BancoEstado (BancoEstado S.A. Corredores de
// Bolsa): buy n shares on the Bolsa de Santiago from the Banca en Línea or
// the app and sell them back on another day, in dollars.
//
// "Acciones y ETFs", as the scraper read it on 2026-10-28 (Rankia's cost
// guide prints the same figures): 0,6% of the amount traded plus $2.500
// per day with executed operations, plus IVA, whatever the channel;
// "BancoEstado S.A. Corredores de Bolsa no hace cobros adicionales por
// derechos de bolsa ni por custodia". Worked example: a $1.000.000 purchase
// costs $10.115 ((6.000 + 2.500) × 1,19).
//   https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/compra-y-venta-de-acciones.html
//   https://www.rankia.cl/blog/corredores-bolsa/7016987-costos-totales-invertir-chile-comisiones-derechos-iva
// The buy and the sale fall on two days: two daily charges. Selling the
// same day pays one: the remark.
//
// Cash: pesos only (deposits.mjs). A dollar line is converted at a rate the
// broker does not print, so its total stays unknown. The sums are in
// ../banchile/santiagoCost.mjs.
//
//   node brokers/bancoestado/bancoestado_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli, sameDayRemark } from "../banchile/santiagoCost.mjs";

const SCHEDULE = {
  broker: "BancoEstado",
  folder: "bancoestado",
  catalogueUrl: new URL("bancoestado-parsed.json", import.meta.url),
  url: "https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/compra-y-venta-de-acciones.html",
  readOn: "2026-10-28",
  side: (clp) => clp * 0.006,
  perDay: 2500,
  basis: "Banca en Línea, 0,6 % par ordre + 2 500 pesos par jour d'opérations, + IVA 19 %, droits de bourse et garde non facturés",
  remark: sameDayRemark,
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
