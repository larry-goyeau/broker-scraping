// What one round trip costs at CAIXA Ações Online: buy n shares at
// price p on B3, sell them back at once, in dollars. The home-broker
// order ("ordens de compra e venda executadas na B3 pelo Home Broker").
//
// The fee page, read on 2026-10-26.
//   https://www.caixa.gov.br/voce/poupanca-e-investimentos/acoes-online/custos-operacionais/
//
//   Brokerage, "calculada a cada     Swing Trade "R$ 4,49 + 0,02% sobre o
//   ordem executada total ou         volume operado"; Day Trade "R$ 2,90
//   parcialmente"                    por ordem". FII exempt, not this order.
//                                    Per order, so a share bought as a
//                                    round lot plus an odd lot pays it
//                                    twice a side.
//   Taxes on the brokerage           none printed; nothing added.
//   Custody                          "estão isentas a cobrança pelos
//                                    serviços de custódia e a taxa de
//                                    inatividade".
//   B3                               0.030% of the amount each side, a
//                                    regular order, first band (see
//                                    ../nubank/b3Cost.mjs).
//
// Formula, each side: Σ orders (R$4.49 + 0.02% × order value) + B3 0.030%;
// then the book's half spread twice. A same-day sell pays R$2.90 an order
// and B3's 0.023% day-trade rate (remark).
// Left out: IRRF "dedo-duro" (an income-tax advance). The account is a
// CAIXA current account in reais; no FX.
//
//   node brokers/caixaacoesonline/caixaacoesonline_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/caixaacoesonline/caixaacoesonline_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.caixa.gov.br/voce/poupanca-e-investimentos/acoes-online/custos-operacionais/";
export const SWING_FIXED = 4.49;
export const SWING_RATE = 0.0002;
export const DAY_TRADE_ORDER = 2.9;

export const roundTrip = makeB3Cost({
  folder: "caixaacoesonline",
  name: "CAIXA Ações Online",
  catalogue: new URL("caixaacoesonline-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, dayTrade }) =>
    perOrder(legs, (leg) => (dayTrade ? DAY_TRADE_ORDER : SWING_FIXED + SWING_RATE * leg.notional)),
  basis:
    "CAIXA Ações Online : courtage R$ 4,49 + 0,02 % du volume par ordre exécutée (swing trade), R$ 2,90 par ordre en day trade ; aucune taxe ajoutée n'est imprimée.",
});

printB3Cli(roundTrip, import.meta.url);
