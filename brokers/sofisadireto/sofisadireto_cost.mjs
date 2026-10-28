// What one round trip costs at Sofisa Direto (Banco Sofisa): buy n
// shares at price p on B3, sell them back at once, in dollars. The
// order sent through the Sofisa Direto app's home broker.
//
// The product page, read on 2026-10-26.
//   https://www.sofisadireto.com.br/investimentos/renda-variavel/
//
//   Brokerage, shares, BDRs, ETFs   "Invista em ações, FIIs, BDRs e ETFs
//                                   sem complicação e com corretagem
//                                   ZERO", "Corretagem com custo ZERO":
//                                   R$0 each side, so no tax on it.
//   B3                              0.030% of the amount each side, a
//                                   regular order, first band (see
//                                   ../nubank/b3Cost.mjs).
//
// Formula: 2 × B3 0.030% + the book's half spread twice.
// Left out: IRRF "dedo-duro" (an income-tax advance); no custody fee is
// printed. The account is funded in reais (Pix/TED); no FX.
//
//   node brokers/sofisadireto/sofisadireto_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/sofisadireto/sofisadireto_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.sofisadireto.com.br/investimentos/renda-variavel/";

export const roundTrip = makeB3Cost({
  folder: "sofisadireto",
  name: "Sofisa Direto",
  catalogue: new URL("sofisadireto-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis: "Sofisa Direto : « corretagem ZERO » sur les actions, BDR et ETF, relu le 2026-10-26.",
});

printB3Cli(roundTrip, import.meta.url);
