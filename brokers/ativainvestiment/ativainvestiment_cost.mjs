// What one round trip costs at Ativa Investimentos: buy n shares at
// price p through the home broker, sell them back at once, in dollars.
// A desk or phone order ("CUSTO MESA DE OPERAÇÕES - TABELA BOVESPA") is
// another line.
//
// The fee page, read on 2026-10-26. The site answers 403 to a bare
// request; the table sits in the page's script bundle.
//   https://www.ativainvestimentos.com.br/Investimentos/Custos/
//
//   Bovespa, "Mercado à vista e    R$ 4,90 an order. ETFs and BDRs go
//   Fracionário (Swing Trade)"     through the same cash ticket.
//   "Day Trade Bovespa"            R$ 2,90 an order.
//   "Taxa de Custódia"             ZERO.
//   Taxes                          the section's footnote: "* valor
//                                  líquido de impostos", so the taxes
//                                  come on top, at rates the page does
//                                  not print. Stand-in: PIS 0.65 % and
//                                  COFINS 4 % (the federal rates on a
//                                  broker's fee) and ISS 5 % (its legal
//                                  ceiling; the city rate runs 2-5 %, the
//                                  maximum is taken), the 9.65 % Safra and
//                                  Toro print: R$4.90 × 1.0965 = R$5.37.
//   Desk                           the Bovespa table. Not an online order.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$5.37 × orders, each side, + 2 × B3 + the book. A same-day
// sell is R$2.90 (+ 9.65 %) an order and B3's 0.023 %: the remark. Left
// out: the IRRF advance. The account is funded in reais.
//
//   node brokers/ativainvestiment/ativainvestiment_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/ativainvestiment/ativainvestiment_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder, withTaxes } from "../nubank/b3Cost.mjs";

const PAGE = "https://www.ativainvestimentos.com.br/Investimentos/Custos/";
const SWING = 4.9;
const DAY = 2.9;

export const roundTrip = makeB3Cost({
  folder: "ativainvestiment",
  name: "Ativa",
  catalogue: new URL("ativainvestiment-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, dayTrade }) => perOrder(legs, () => withTaxes(dayTrade ? DAY : SWING)),
  basis:
    "Ativa Home Broker : R$ 4,90 par ordre (R$ 2,90 en day trade), « valor líquido de impostos » ; taux non imprimés, PIS 0,65 % + COFINS 4 % + ISS 5 % (plafond légal) retenus (R$ 5,37), un ordre par lot rond et un pour le lot fractionnaire.",
  confidence: "moyenne : impôts sur le courtage au taux plafond, la page ne les chiffre pas",
});

printB3Cli(roundTrip, import.meta.url);
