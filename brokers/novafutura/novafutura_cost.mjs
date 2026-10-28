// What one round trip costs at Nova Futura: buy n shares at price p on
// the platform, without a linked adviser, sell them back at once, in
// dollars. A desk order, a forced close and a forward are other lines.
//
// The fee page, read on 2026-10-26 ("Tarifas atualizadas em 18/08/2026").
//   https://www.novafutura.com.br/custos
//
//   Mercado à vista                "No máximo R$ 3,49 por ordem em day
//                                  trade e R$ 6,98 em swing trade, mesmo
//                                  valor para BDRs, ETFs e opções, via
//                                  plataforma e sem assessor vinculado."
//                                  The table prints the same R$6.98 /
//                                  R$3.49 for Ações, BDR and "ETF de renda
//                                  variável"; the sentence above covers
//                                  every ETF, so a fixed-income ETF pays
//                                  the same. "No máximo": the ceiling is
//                                  taken (owner rule).
//   Taxes                          the page adds nothing on top.
//   Custody, account               "Conta, manutenção, TED e Pix são
//                                  R$ 0,00."
//   Desk, forced close, forward    "0,50% + R$ 25,21 · mín R$ 40,00". Not
//                                  an online order.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$6.98 × orders, each side, + 2 × B3 + the book. A same-day
// sell is R$3.49 an order and B3's 0.023 %: the remark. Left out: the
// IRRF advance, the paid Profit/Tryd platforms. The account is funded in
// reais.
//
//   node brokers/novafutura/novafutura_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/novafutura/novafutura_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.novafutura.com.br/custos";
const SWING = 6.98;
const DAY = 3.49;

export const roundTrip = makeB3Cost({
  folder: "novafutura",
  name: "Nova Futura",
  catalogue: new URL("novafutura-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, dayTrade }) => perOrder(legs, () => (dayTrade ? DAY : SWING)),
  basis:
    "Nova Futura, plateforme sans assessor : R$ 6,98 par ordre en swing trade (R$ 3,49 en day trade) sur actions, BDR et ETF, plafond « no máximo » retenu, un ordre par lot rond et un pour le lot fractionnaire.",
});

printB3Cli(roundTrip, import.meta.url);
