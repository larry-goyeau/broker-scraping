// What one round trip costs at tyba (tyba por Credicorp Capital, Colombia;
// "Acciones Internacionales" run by Credicorp Capital LLC, FINRA/SIPC,
// offered in Colombia by Credicorp Capital Colombia S.A. as correspondent):
// buy n NYSE shares or ETFs at price p, sell them straight back, in the app,
// in dollars.
//
// Pages read in full 2026-10-26:
//   https://tyba.com.co/invertir-en-acciones/
//   https://tyba.com.co/blog/invertir-en-acciones-de-estados-unidos-desde-colombia/  (7 Oct 2026)
//
//   whole units   "Opera con comisión 0% en acciones internacionales
//                 completas"; "Al comprar o vender unidades completas,
//                 eliminamos las comisiones"
//   fractions     "Las fracciones tienen una comisión de 0.3% por orden"
//   SEC / TAF     "cargos regulatorios pequeños, como los conocidos REG y
//                 TAF" "Se aplican solo al vender": no rate printed, so 0
//   CAT           not printed: 0
//   currency      "Recargas en pesos, la conversión a dólares se hace dentro
//                 de la plataforma y retiras a tu cuenta bancaria". No rate,
//                 spread or markup is printed on any tyba page, and no
//                 Credicorp page prints a nearby figure to stand in.
//
// Cash comes in pesos only and every NYSE line is in dollars, so the trip
// carries a forced COP/USD conversion at a rate tyba does not publish.
// Owner rule: an unpublished forced FX makes the total N/A. The file still
// returns the book, the commission and the parts.
//
// Formula: book (quoted NBBO) + 0 (whole) or 0.3 % × notional per order
// (fractional) + FX (unknown) = N/A.
//
// Routing: Credicorp Capital LLC (CRD 136791) is the US broker-dealer and
// files no 606. tyba's US shares run on Alpaca's Broker API
// (https://alpaca.markets/blog/tyba-creating-investment-access-in-latin-america/)
// and the FINRA 2026 Q2 adopt-by-reference list has CRD 136791 adopting
// Alpaca Securities (288202) and Pershing (7560): Alpaca, key `alpaca`.
//
// Power Cash interest and the US$1 minimum are not costs.
//
//   node brokers/tyba/tyba_cost.mjs JPM XNYS USD --shares=3 --price=300
//   node brokers/tyba/tyba_cost.mjs KO XNYS USD --shares=14.5 --price=70
//   node brokers/tyba/tyba_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const FRACTION_RATE = 0.003;

const SCHEDULE = {
  broker: "tyba",
  folder: "tyba",
  catalogueUrl: new URL("tyba-parsed.json", import.meta.url),
  url: "https://tyba.com.co/invertir-en-acciones/",
  page: "https://tyba.com.co/blog/invertir-en-acciones-de-estados-unidos-desde-colombia/",
  readOn: "2026-10-26",
  entity: "Credicorp Capital LLC (FINRA/SIPC), correspondent Credicorp Capital Colombia S.A.",
  rule606: "alpaca",
  cash: "COP",
  deposits: ["COP"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    if (!ctx.fractional) return { buy: 0, sell: 0, note: "unités complètes : commission 0 %" };
    const each = ctx.notionalUsd == null ? null : ctx.notionalUsd * FRACTION_RATE;
    if (each == null) return null;
    return { buy: each, sell: each, note: `fraction : 0,3 % × ${Number(ctx.notionalUsd.toFixed(2))} $ = ${Number(each.toFixed(2))} $ par ordre` };
  },
  levies: { sec: false, taf: false, cat: false },
  fx: { unpublished: true },
  basis:
    "page Acciones & ETFs de tyba et article du 2026-10-07, relus le 2026-10-26 : « comisión 0% en acciones internacionales completas », " +
    "« Las fracciones tienen una comisión de 0.3% por orden », recharges en pesos converties dans la plateforme",
  notes: [
    "change COP/USD forcé, taux non publié : total N/A (règle du propriétaire)",
    "REG et TAF cités sans taux : 0",
    "606 de Alpaca Securities (CRD 288202), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
