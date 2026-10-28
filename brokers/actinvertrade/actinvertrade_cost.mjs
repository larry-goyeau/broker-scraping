// What one round trip costs at Actinver Trade (formerly Bursanet), the
// self-directed online account of Actinver Casa de Bolsa: buy n shares on
// the Bolsa Mexicana de Valores and sell them straight back, in dollars.
// Every catalogue line is quoted in pesos and the account settles in pesos
// (SPEI), so nothing is converted.
//
// Investment-services guide (1-PV-GR-007, version 26.1.3 of 01/06/2026), section 6.4 "Comisiones por
// servicios de Inversión no asesorados en Actinver Trade por Internet", read
// on 2026-10-26:
//   "Operaciones de compra-venta mercado de capitales: Calculado con base en
//   el saldo acumulado por operaciones de capitales en los 30 días
//   anteriores a la operación: De 0 a 1 millón de pesos = 0.25% ...
//   Más de 10 millones = 0.10%"
//   "I.V.A. A todos los cobros realizados por comisiones, cargos o cuotas se
//   les agrega el importe calculado de I.V.A."
//   "Información en línea de BMV $0.00 MXN. Administración de cuenta $0.00
//   MXN. Custodia INDEVAL $0.00 MXN."
// The FAQ: "Las comisiones por compra-venta de Acciones van de 0.10% a
// 0.25%, dependiendo de las operaciones realizadas en un mes", and a new
// account gets "un mes sin comisiones en el mercado de capitales al realizar
// tu primer depósito mayor a $10,000 MXN".
//   https://www.actinver.com/documents/74160/1977463/Bursanet+Guia+de+Servicios+de+Inversion.pdf/4097c6f2-a595-66b1-0769-0fc022098121?t=1636472018991
//   https://actinvertrade.actinver.com/preguntas-frecuentes.html
//
// Formula: each order pays 0.25% of its amount (the first band: no volume
// in the 30 days before) plus 16% IVA, on the buy and on the sell, plus the
// BMV book. The guide's "Comisiones mínimas por compraventa de acciones"
// line prints no figure, so no floor is applied. The lower bands depend on
// the client's past 30-day volume, not on this order: they are the remark,
// as a cut of the commission (0.25 → 0.20% = 20% lower, 0.15% = 40%,
// 0.10% = 60%; IVA scales both alike). Left out: the 10% ISR on a gain (none on
// an immediate round trip), fund lines, the 6 USD international transfer,
// the first month without commission (a welcome offer, not the tariff).
// The sums are in ./bmvCost.mjs.
//
//   node brokers/actinvertrade/actinvertrade_cost.mjs WALMEX XMEX MXN --shares=400 --price=43.8
//
// `roundTrip(...)` reads files, not the network.

import { bmvRoundTrip, printCli } from "./bmvCost.mjs";

const SCHEDULE = {
  broker: "Actinver Trade",
  folder: "actinvertrade",
  catalogueUrl: new URL("actinvertrade-parsed.json", import.meta.url),
  url: "https://www.actinver.com/documents/74160/1977463/Bursanet+Guia+de+Servicios+de+Inversion.pdf/4097c6f2-a595-66b1-0769-0fc022098121?t=1636472018991",
  readOn: "2026-10-26",
  rate: 0.0025,
  minimum: 0,
  iva: true,
  tariff: "0,25 % + IVA 16 % par ordre (tranche de 0 à 1 million de pesos échangés sur les 30 jours précédents)",
  remark:
    "Over 1M MXN traded in the past 30 days: fees are 20% lower; over 5M: 40% lower; over 10M: 60% lower.",
};

export const roundTrip = (query) => bmvRoundTrip(SCHEDULE, query);

printCli(import.meta.url, roundTrip);
