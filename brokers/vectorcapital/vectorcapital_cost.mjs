// What one round trip costs at Vector (Vector Capital Corredores de Bolsa):
// buy n shares on the Bolsa de Santiago and sell them back on another day,
// in dollars.
//
// The only rate Vector prints is its Vector Trade terminal's, read on
// 2026-10-29: "Comisión fija mensual de Uso de la Plataforma $100.000
// mensual. Este costo no se cobrará si el cliente llega a un monto en
// comisiones superior al fijo de $100.000 pesos. Comisión por Operaciones:
// equivalente a 0,15% del monto diario transado más Impuesto al Valor
// Agregado." The web self-investment platform prints no rate of its own;
// trii and Zesty, which execute in Santiago at Vector, charge 0.15% + IVA
// too.
//   https://vectorcapital.cl/traders/
// So each side: 0.15% × 1.19. The monthly platform fee is the remark.
// US lines have no published tariff. The owner's stand-in (2026-10-29):
// the same 0.15% + IVA on the peso value of each order, as for the
// Argentine brokers with no US tariff. Vector names no US dealer for its
// own clients; the US accounts trii and Zesty open "with Vector Capital"
// are held at Alpaca Securities, and LatamFintech reports the Vector-Alpaca
// alliance. So Alpaca's pass-throughs, as ../zesty/zesty_cost.mjs: SEC and
// TAF on the sale, CAT $0.000003 a share on the sale, each rounded up to
// the cent; book: Alpaca's 606 (spreads/rule606.mjs).
//   https://www.latamfintech.co/articles/corredora-de-bolsa-vector-capital-se-asocio-con-la-wealtech-colombiana-trii-como-apuesta-por-inversionistas-retail
//
// Cash: pesos and dollars (deposits.mjs). Vector prints no exchange rate:
// every line carries the figure-less "FX when cash ≠ CCY.". The sums are in
// ../banchile/santiagoCost.mjs.
//
//   node brokers/vectorcapital/vectorcapital_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//   node brokers/vectorcapital/vectorcapital_cost.mjs AAPL XNAS USD --shares=4 --price=250
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli } from "../banchile/santiagoCost.mjs";

const SCHEDULE = {
  broker: "Vector",
  folder: "vectorcapital",
  catalogueUrl: new URL("vectorcapital-parsed.json", import.meta.url),
  url: "https://vectorcapital.cl/traders/",
  readOn: "2026-10-29",
  side: (clp) => clp * 0.0015,
  basis: "tarif Vector Trade, 0,15 % du montant + IVA 19 %",
  remark: () => "Platform fee is CLP 100,000 a month, waived above CLP 100,000 of commission.",
  us: {
    rule606: "alpaca",
    levies: { sec: "up", taf: "up", cat: { perShare: 0.000003, mode: "up", sellOnly: true } },
    basis: "aucun tarif US publié : le tarif Vector Trade, 0,15 % du montant + IVA 19 %, tient lieu (choix du propriétaire, 2026-10-29) ; SEC, TAF et CAT d'Alpaca Securities à la vente, au centime supérieur",
  },
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
