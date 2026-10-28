// What one round trip costs at Lemon (Lemon Argentina; the stock product is
// offered by Quaestus Advisory S.A., CNV adviser no. 1098, and orders are
// executed by Alpaca Securities LLC): buy n shares at price p, sell them
// straight back, in the app, in dollars. US-listed shares and ETFs
// ("Índices"), whole or fractional. Packs and crypto stay out.
//
// Help centre, read 2026-10-26:
//   https://help.lemon.me/es/articles/14979054-cuales-son-las-comisiones-y-a-que-precio-se-ejecuta-mi-orden
//   https://help.lemon.me/es/articles/14979916-que-es-el-producto-de-acciones-de-lemon
//   https://help.lemon.me/es/articles/16152908-comisiones-y-cargos-que-cobra-lemon
//
//   commission   "Lemon cobra el 0,5% por operación, tanto para compras como
//                para ventas. Es la única comisión: no hay costos de
//                mantenimiento, suscripción ni costos ocultos."
//                "con una comisión del 0,5% por operación, ya sea que entres
//                con pesos o dólares digitales"
//   SEC/TAF/CAT  not printed: 0
//   orders       market orders, "al precio vigente en el momento en que
//                Alpaca Securities procesa la orden"
//
// Formula: book (605 × Q of Alpaca) + 0.5 % of the buy + 0.5 % of the sale.
//
// Routing: Alpaca Securities LLC executes and files its own 606:
// rule606 key "alpaca".
//
// Cash: pesos, and dollars. Dollars wired from a bank are held as "dólares
// digitales" (USDC; "El tipo de cambio USD-USDC es variable", shown before
// depositing, so at the deposit, not on an order), and the product page says
// shares cost "una comisión del 0,5% por operación, ya sea que entres con
// pesos o dólares digitales": a dollar line needs no conversion here. A peso
// order converts at a rate Lemon does not print: no FX remark.
//   https://lemon.me/en/blog/lemon-habilita-dep%C3%B3sitos-y-retiros-en-d%C3%B3lares-en-argentina
//
//   node brokers/lemonar/lemonar_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/lemonar/lemonar_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const RATE = 0.005;

const SCHEDULE = {
  broker: "Lemon",
  folder: "lemonar",
  catalogueUrl: new URL("lemonar-parsed.json", import.meta.url),
  url: "https://help.lemon.me/es/articles/14979054-cuales-son-las-comisiones-y-a-que-precio-se-ejecuta-mi-orden",
  readOn: "2026-10-26",
  entity: "Quaestus Advisory S.A. (CNV 1098); Alpaca Securities LLC (execution)",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["ARS", "USD"],
  feeCurrency: "USD",
  ticket: ({ notionalUsd }) => {
    if (!(notionalUsd > 0)) return null;
    const each = notionalUsd * RATE;
    return { buy: each, sell: each, note: `0,5 % de ${Number(notionalUsd.toFixed(2))} $ : ${Number(each.toFixed(4))} $ par ordre` };
  },
  levies: { sec: false, taf: false, cat: false },
  basis:
    "aide Lemon « ¿Cuáles son las comisiones…? », relue le 2026-10-26 : « Lemon cobra el 0,5% por operación, tanto para compras como para ventas. Es la única comisión »",
  notes: [
    "exécution chez Alpaca Securities LLC : Q d'Alpaca",
    "dollars tenus en « dólares digitales » (USDC, change USD-USDC au dépôt), qui achètent les actions avec les seuls 0,5 % : pas de change sur une ligne en dollars",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
