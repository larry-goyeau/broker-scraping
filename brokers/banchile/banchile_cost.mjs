// What one round trip costs at Banchile Inversiones (Banchile Corredores de
// Bolsa S.A., Banco de Chile group): buy n shares on the Bolsa de Santiago
// through the digital channel (App Mi_INVERSIÓN, banchileinversiones.cl,
// bancochile.cl) and sell them back on another day, in dollars.
//
// Banchile FAQ, as the scraper read it on 2026-10-28 (the page now answers
// a maintenance notice, and Rankia's Banchile review of 2026 prints the
// same figures): "Comisión de canal digital (App Mi_INVERSIÓN,
// www.banchileinversiones.cl, www.bancochile.cl) : Comisión mínima de 0,12
// UF + IVA Comisión ficha 0,8% + IVA"; through an executive the minimum is
// 0,8 UF.
//   https://ww2.banchileinversiones.cl/web/empresas/p-preguntas-frecuentes
//   https://www.rankia.cl/blog/corredores-bolsa/7027456-banchile-inversiones-como-operar-comisiones-regulacion
// So each side: max(0.8% of the amount, 0.12 UF) × 1.19. The UF is taken on
// the fx.mjs date (./santiagoCost.mjs). No custody or exchange fee is
// printed.
//
// Cash: pesos only (deposits.mjs), and the online catalogue is in pesos.
// The sums are in ./santiagoCost.mjs.
//
//   node brokers/banchile/banchile_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli, UF_CLP } from "./santiagoCost.mjs";

const RATE = 0.008;
const MIN_UF = 0.12;

const SCHEDULE = {
  broker: "Banchile",
  folder: "banchile",
  catalogueUrl: new URL("banchile-parsed.json", import.meta.url),
  url: "https://ww2.banchileinversiones.cl/web/empresas/p-preguntas-frecuentes",
  readOn: "2026-10-28",
  side: (clp) => Math.max(clp * RATE, MIN_UF * UF_CLP),
  basis: "canal digital (App Mi_INVERSIÓN), 0,8 % par ordre, au moins 0,12 UF, + IVA 19 %",
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
