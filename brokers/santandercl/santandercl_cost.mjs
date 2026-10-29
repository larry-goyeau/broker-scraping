// What one round trip costs at Santander (Santander Corredores de Bolsa
// Limitada, Banco Santander Chile): buy n shares on the Bolsa de Santiago
// through the bank's website or the Santander Chile app and sell them back
// on another day, in dollars.
//
// Broker page, read on 2026-10-29, "Renta variable local": "Monto mínimo:
// $100.000", "Costo máximo: 1% + IVA. Costo internet: 0,35% + IVA."
//   https://banco.santander.cl/personas/corredores-de-bolsa
// So each side: 0.35% × 1.19. No floor, custody or exchange fee is printed.
//
// Cash: pesos only (deposits.mjs). A dollar line is converted at a rate the
// broker does not print, so its total stays unknown. The sums are in
// ../banchile/santiagoCost.mjs.
//
//   node brokers/santandercl/santandercl_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli } from "../banchile/santiagoCost.mjs";

const SCHEDULE = {
  broker: "Santander",
  folder: "santandercl",
  catalogueUrl: new URL("santandercl-parsed.json", import.meta.url),
  url: "https://banco.santander.cl/personas/corredores-de-bolsa",
  readOn: "2026-10-29",
  side: (clp) => clp * 0.0035,
  basis: "ordre par internet, 0,35 % par ordre + IVA 19 %",
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
