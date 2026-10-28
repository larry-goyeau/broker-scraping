// What one round trip costs at INVEX Casa de Bolsa (INVEX Trade platform):
// buy n shares on the Bolsa Mexicana de Valores and sell them straight
// back, in dollars. Every catalogue line is quoted in pesos and settles in
// pesos, so nothing is converted.
//
// "Costos y comisiones", section Casa de Bolsa / INVEX Casa de Bolsa, read
// on 2026-10-26 ("Comisiones vigentes a partir del 03 de noviembre de 2020"):
//   "Comisiones y Gastos de intermediación: Compra /Venta de acciones
//   1.00% + IVA Por operación"
//   "Cuota Anual $2,200.00 + IVA (aplica únicamente a contratos con
//   inversiones en mercado de dinero, capitales y fondos de inversión)"
//   "Administración 0.375% sobre el valor total del portafolio ..., máximo
//   $1,000 + IVA" (quarterly)
//   "Custodia (0.006% sobre valor del portafolio ... + $25.00) + IVA Por
//   serie accionaria" (monthly)
//   https://invex.com/costos-y-comisiones
//
// Formula: each order pays 1.00% of its amount plus 16% IVA, on the buy and
// on the sell, plus the BMV book. No minimum and no separate online rate
// are printed. The yearly fee and the quarterly administration fee are on
// the contract, not this order, and are the remark; the monthly custody
// (0.072% a year plus 25 pesos a line a month) is small and stays out.
// Left out: deposits and withdrawals of shares, SPEI transfers, the 10% ISR
// on a gain (none on an immediate round trip). The sums are in
// ../actinvertrade/bmvCost.mjs.
//
//   node brokers/invexcasabolsa/invexcasabolsa_cost.mjs WALMEX XMEX MXN --shares=400 --price=43.8
//
// `roundTrip(...)` reads files, not the network.

import { bmvRoundTrip, printCli } from "../actinvertrade/bmvCost.mjs";

const SCHEDULE = {
  broker: "INVEX Casa de Bolsa",
  folder: "invexcasabolsa",
  catalogueUrl: new URL("invexcasabolsa-parsed.json", import.meta.url),
  url: "https://invex.com/costos-y-comisiones",
  readOn: "2026-10-26",
  rate: 0.01,
  minimum: 0,
  iva: true,
  remark: "Yearly fee 2,200 MXN plus IVA; administration 0.375% of the portfolio a quarter, at most 1,000 MXN plus IVA.",
};

export const roundTrip = (query) => bmvRoundTrip(SCHEDULE, query);

printCli(import.meta.url, roundTrip);
