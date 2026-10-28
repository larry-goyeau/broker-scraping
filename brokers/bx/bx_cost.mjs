// What one round trip costs at Bx+ (Casa de Bolsa Ve por Más) through its
// online service, Casa de Bolsa en Línea B×+: buy n shares on the Bolsa
// Mexicana de Valores and sell them straight back, in dollars. Every
// catalogue line is quoted in pesos and settles in pesos, so nothing is
// converted.
//
// Cuadro de Comisiones of the Casa de Bolsa, read on 2026-10-26 (the online
// page's "Consulta las comisiones aquí" links to it):
//   "Tipo de comisión / Máximo por aplicar: Por corretaje 1.70%"
//   "Forma de cálculo: Monto de la operación por el (% de comisión aplicable
//   máximo 1.70%) = comisión por cobrar."
//   "Por custodia de valores 0.25% Valor del portafolio por el bimestre"
// Clausulado Integral Casa de Bolsa: the statement shows "la comisión
// cobrada con el desglose del Impuesto al Valor Agregado", and the group's
// commission schedule says "Todas las comisiones ... no incluyen IVA".
//   https://cb.vepormas.com.mx/PortalCBnuevo/Nosotros/Comisiones/Cuadro_de_Comisiones.pdf
//   https://www.vepormas.com/fwpf/portal/documents/servicios-casa-de-bolsa-linea
//   https://www.vepormas.com/fwpf/storage/CLAUSULADO_INTEGRAL_CASABOLSA.pdf
//   https://www.vepormas.com/fwpf/storage/comisiones.pdf
//
// Formula: the brokerage is printed only as a maximum, so the maximum is
// taken (owner's rule for a discretionary range): 1.70% of each order plus
// 16% IVA, on the buy and on the sell, plus the BMV book. No minimum is
// printed. Custody (0.25% of the portfolio each bimester) is real and
// sizeable: the remark. Left out: the "Por administración $300 USD" monthly
// ceiling and the 2% advice and 5% portfolio-management lines (other
// services), the 10% ISR on a gain (none on an immediate round trip).
// The sums are in ../actinvertrade/bmvCost.mjs.
//
//   node brokers/bx/bx_cost.mjs WALMEX XMEX MXN --shares=400 --price=43.8
//
// `roundTrip(...)` reads files, not the network.

import { bmvRoundTrip, printCli } from "../actinvertrade/bmvCost.mjs";

const SCHEDULE = {
  broker: "Bx+",
  folder: "bx",
  catalogueUrl: new URL("bx-parsed.json", import.meta.url),
  url: "https://cb.vepormas.com.mx/PortalCBnuevo/Nosotros/Comisiones/Cuadro_de_Comisiones.pdf",
  readOn: "2026-10-26",
  rate: 0.017,
  minimum: 0,
  iva: true,
  tariff: "1,7 % (maximum publié, retenu) + IVA 16 % par ordre",
  remark: "Custody is 0.25% of the portfolio every two months.",
};

export const roundTrip = (query) => bmvRoundTrip(SCHEDULE, query);

printCli(import.meta.url, roundTrip);
