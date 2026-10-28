// What one round trip costs at GBM (GBM Grupo Bursátil Mexicano, Casa de
// Bolsa): buy n shares at price p in the GBM app, sell them back at once,
// in dollars. Trading MX: the Bolsa Mexicana, its local board and the SIC,
// in pesos. Trading USA: US shares and ETFs held through DriveWealth, in
// dollars. Advisory and discretionary accounts are other lines.
//
// Read on 2026-10-26.
//   https://global.gbm.com/wp-content/uploads/2026/08/03140239/Guia-de-Servicios-GBM_v3.pdf
//     Guía de Servicios de Inversión (07/26), p. 18: "Ejecución de
//     operaciones sobre Instrumentos de Renta Variable a través de las
//     plataformas GBM y GBM+: Hasta .25%. Por operación, sobre el valor de
//     la operación celebrada. Asimismo, se señala que el uso de la
//     plataforma no tiene costo"; "A las comisiones que cobre la Casa de
//     Bolsa por sus servicios, se le aumentará el Impuesto al Valor
//     Agregado". Its "Clases de valores" (p. 17) include "Acciones y
//     fracciones de acciones en el extranjero (DriveWealth)": Trading USA
//     is the same renta-variable line. The "Hasta .75%" and "Hasta 2%"
//     lines are the adviser services, not the app.
//   https://gbm.com/faqs/que-comisiones-cobran-al-invertir-en-gbm/
//     Trading MX, "considerando el monto operado promedio de los últimos 3
//     meses": up to MXN 1,000,000 0.25 %; 1,000,001 to 3,000,000 0.20 %;
//     3,000,001 to 5,000,000 0.15 %; 5,000,001 to 10,000,000 0.125 %; above
//     10,000,000 0.10 % (the guide, p. 19, prints the same scale for
//     "Trading México"). A new client is in the first band: 0.25 %. The
//     lower bands are a remark, as the cut of the commission itself:
//     "… fees are 20% lower; … 40%; … 50%; … 60% lower."
//   IVA: 16 % (Ley del IVA, art. 1). BMV and Indeval fees are the casa de
//   bolsa's own (../actinvertrade/bmvCost.mjs); no SEC, TAF or CAT line is
//   printed for Trading USA: 0.
//
// Formula: each side 0.25 % × 1.16 = 0.29 % of the amount, both ways, plus
// the book. Trading MX through ../actinvertrade/bmvCost.mjs.
//
// Money. Deposits arrive in pesos at Smart Cash (deposits.mjs: MXN). Trading
// USA is "ahora en dólares": "podrás transferir desde Smart Cash a Trading
// USA para adquirir dólares", at a rate GBM does not print. While
// deposits.mjs lists MXN only, a US line is a forced conversion with no
// published rate: N/A. With USD listed as a cash currency (the Trading USA
// dollar balance), the US total carries no FX and no FX remark.
//
// Book: BMV and SIC lines read the BMV leaf (mx-touch). A US line uses
// DriveWealth's 605 mix (spreads/rule606.mjs ASSIGNED "drivewealth") once
// "gbm" is aliased to it; until then the quoted NBBO.
//
//   node brokers/gbm/gbm_cost.mjs WALMEX XMEX MXN --shares=300 --price=57
//   node brokers/gbm/gbm_cost.mjs SPY XMEX MXN --shares=2 --price=12000
//   node brokers/gbm/gbm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { bmvRoundTrip, IVA_MX } from "../actinvertrade/bmvCost.mjs";
import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";

const GUIDE = "https://global.gbm.com/wp-content/uploads/2026/08/03140239/Guia-de-Servicios-GBM_v3.pdf";
const FAQ = "https://gbm.com/faqs/que-comisiones-cobran-al-invertir-en-gbm/";
const READ_ON = "2026-10-26";
const CATALOGUE = new URL("gbm-parsed.json", import.meta.url);
const RATE = 0.0025;

// Trading MX bands, the 3-month average traded amount in pesos.
export const MX_BANDS = [
  { over: 0, rate: 0.0025 },
  { over: 1_000_000, rate: 0.002 },
  { over: 3_000_000, rate: 0.0015 },
  { over: 5_000_000, rate: 0.00125 },
  { over: 10_000_000, rate: 0.001 },
];

// "… x% lower": the cut of the commission itself at each lower band (0.25 %
// → 0.20 % is 20 %), the same with or without IVA.
const lower = (rate) => Math.round((100 * (RATE - rate)) / RATE);
export const MX_REMARK =
  `3-month average traded over MXN 1M: fees are ${lower(0.002)}% lower; over 3M: ${lower(0.0015)}%; ` +
  `over 5M: ${lower(0.00125)}%; over 10M: ${lower(0.001)}% lower.`;

const MX_SCHEDULE = {
  broker: "GBM",
  folder: "gbm",
  catalogueUrl: CATALOGUE,
  url: FAQ,
  readOn: READ_ON,
  rate: RATE,
  iva: true,
  tariff: "0,25 % + IVA 16 % par ordre (première tranche du montant moyen sur trois mois)",
  remark: MX_REMARK,
};
const mx = (query) => bmvRoundTrip(MX_SCHEDULE, query);

export const roundTrip = makeLineCost({
  folder: "gbm",
  name: "GBM",
  catalogue: CATALOGUE,
  url: GUIDE,
  base: "MXN",
  price: ({ us, listing, notional }) => {
    if (!us) return { buy: null, sell: null, why: `GBM ne publie aucun tarif pour ${listing.exchange} en ${listing.currency}` };
    const each = notional * RATE * (1 + IVA_MX);
    return {
      buy: each,
      sell: each,
      feeCurrency: "USD",
      basis:
        `GBM Trading USA (DriveWealth), guide des services relu le ${READ_ON} : renta variable par les plateformes GBM et GBM+ « Hasta .25% » ` +
        `par opération + IVA 16 %, à l'achat et à la vente ; SEC, TAF et CAT non imprimés, comptés 0`,
      confidence: `${(each).toFixed(4)} $ par ordre (0,29 % IVA comprise)`,
      forcedFx: {
        rate: null,
        why: "change forcé MXN → USD de Smart Cash vers Trading USA : GBM n'imprime aucun taux",
      },
      detail: { rate: RATE, iva: IVA_MX },
    };
  },
  delegate: (row) => (row.mic === "XMEX" ? mx : null),
});

printLineCli(roundTrip, import.meta.url);
