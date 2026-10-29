// What one round trip costs at MBI (MBI Corredores de Bolsa S.A.) through
// MBI Trading: buy n shares on the Bolsa de Santiago and sell them back on
// another day, in dollars.
//
// MBI Trading FAQ, read on 2026-10-29: "Transparencia total en renta
// variable local: comisión de 0,22% del monto de la operación + $5.000 +
// IVA. Sin cobros ocultos."
//   https://www.mbi.cl/landing-corredora/landing01/index.html
// So each side: (0.22% of the amount + $5.000) × 1.19. A Santiago dollar
// line pays it on its peso value.
// US lines (through StoneX's platform) have no published tariff. The
// owner's stand-in (2026-10-29): the same 0.22% + $5.000 + IVA on the
// peso value of each order, as for the Argentine brokers with no US
// tariff. MBI names StoneX Financial Inc. for its clients' foreign
// accounts (https://mbi.cl/servicios-internacionales), and StoneX's Form
// CRS says it passes on exchange and regulatory fees: SEC and TAF on the
// sale at the regulators' rates, rounded up to the cent; no CAT printed.
// Book: StoneX Financial's 606 (spreads/rule606.mjs).
//   https://files.brokercheck.finra.org/crs_18456.pdf
//
// Cash: pesos and dollars (deposits.mjs). MBI prints no exchange rate:
// every line carries the figure-less "FX when cash ≠ CCY.", as Bourse
// Brokers (no group bank to borrow a spread from). The sums are in
// ../banchile/santiagoCost.mjs.
//
//   node brokers/mbicorredores/mbicorredores_cost.mjs SQM-B BCS CLP --shares=20 --price=46000
//   node brokers/mbicorredores/mbicorredores_cost.mjs AAPL XNAS USD --shares=4 --price=250
//
// `roundTrip(...)` reads files, not the network.

import { santiagoRoundTrip, printCli } from "../banchile/santiagoCost.mjs";

const SCHEDULE = {
  broker: "MBI",
  folder: "mbicorredores",
  catalogueUrl: new URL("mbicorredores-parsed.json", import.meta.url),
  url: "https://www.mbi.cl/landing-corredora/landing01/index.html",
  readOn: "2026-10-29",
  side: (clp) => clp * 0.0022 + 5000,
  basis: "MBI Trading, 0,22 % + 5 000 pesos par ordre, + IVA 19 %",
  us: {
    rule606: "stonexfinancial",
    levies: { sec: "up", taf: "up", cat: false },
    basis: "aucun tarif US publié : le tarif MBI Trading de Santiago, 0,22 % + 5 000 pesos par ordre + IVA 19 %, tient lieu (choix du propriétaire, 2026-10-29) ; SEC et TAF répercutées par StoneX Financial, au centime supérieur",
  },
};

export function roundTrip(query) {
  return santiagoRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
