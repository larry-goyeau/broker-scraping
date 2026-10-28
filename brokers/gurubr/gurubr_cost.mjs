// What one round trip costs with Guru: buy n shares at price p in the Guru
// app, which routes the order to B3 through its partner broker Genial
// Investimentos ("Corretora homologada"), sell them back at once, in
// dollars.
//
// The pages, read on 2026-10-26.
//   https://guru.com.vc/
//   https://guru.com.vc/faq/
//
//   Brokerage                      "Invista sem corretagem. Compre e venda
//                                  ações, FIIs, BDRs com apenas três
//                                  cliques. Sem complicações, sem depósito
//                                  mínimo e sem corretagem." ETFs trade
//                                  on the same ticket. R$0 each side.
//   Taxes                          nothing on zero brokerage.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Formula: 2 × B3 (0.030 % of the amount, to the centavo) + the book.
// Left out: the IRRF advance; Guru prints no custody fee. The account is
// funded in reais.
//
//   node brokers/gurubr/gurubr_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07

import { makeB3Cost, printB3Cli } from "../nubank/b3Cost.mjs";

const PAGE = "https://guru.com.vc/";

export const roundTrip = makeB3Cost({
  folder: "gurubr",
  name: "Guru",
  catalogue: new URL("gurubr-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: () => 0,
  basis: "Guru (ordres via Genial Investimentos) : courtage zéro sur actions, BDR et ETF dans l'app (« Invista sem corretagem »).",
});

printB3Cli(roundTrip, import.meta.url);
