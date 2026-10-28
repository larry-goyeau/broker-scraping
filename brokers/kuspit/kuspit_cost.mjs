// What one round trip costs at Kuspit Casa de Bolsa, an online-only
// Mexican broker: buy n shares on the Bolsa Mexicana de Valores and sell
// them straight back, in dollars. Every catalogue line is quoted in pesos
// and the account is funded in pesos by SPEI, so nothing is converted.
//
// Footer item "Comisiones" (id 7) of kuspit.com, read on 2026-10-26:
//   "Comisión por operaciones de compraventa: Mercado de capitales = 0.20%
//   por operación." "Kuspit no cobra ninguna comisión por administración y
//   custodia de las inversiones de clientes."
// Intermediation contract, Anexo "B" section 12 "Monto mínimo y comisiones",
// same day:
//   "Operaciones en el mercado de capitales 0.20% por operación"
//   "Mantenimiento Personas Físicas (anual)* 0.99%" ... "*Mantenimiento con
//   al menos una rotación de portafolio al mes en Mercado de Capitales
//   (sobre el valor promedio del portafolio) Sin costo"
//   "Todas las comisiones causan el Impuesto al Valor Agregado (I.V.A.)."
//   https://ok2.kuspit.com/OpenKuspit/api/k2/generales/footer
//   https://api.kuspit.com:8080/kuspit/archivos/contratointermediacion.pdf
//
// Formula: each order pays 0.20% of its amount plus 16% IVA, on the buy and
// on the sell, plus the BMV book. No minimum is printed. The yearly
// maintenance fee is on the portfolio, not this order: it is the remark.
// Left out: the 10% ISR on a gain (none on an immediate round trip), fund
// and CETES lines. The sums are in ../actinvertrade/bmvCost.mjs.
//
//   node brokers/kuspit/kuspit_cost.mjs WALMEX XMEX MXN --shares=400 --price=43.8
//
// `roundTrip(...)` reads files, not the network.

import { bmvRoundTrip, printCli } from "../actinvertrade/bmvCost.mjs";

const SCHEDULE = {
  broker: "Kuspit",
  folder: "kuspit",
  catalogueUrl: new URL("kuspit-parsed.json", import.meta.url),
  url: "https://kuspit.com/",
  readOn: "2026-10-26",
  rate: 0.002,
  minimum: 0,
  iva: true,
  remark: "Maintenance is 0.99% of the portfolio a year plus IVA, waived in a month with trades of at least the portfolio value.",
};

export const roundTrip = (query) => bmvRoundTrip(SCHEDULE, query);

printCli(import.meta.url, roundTrip);
