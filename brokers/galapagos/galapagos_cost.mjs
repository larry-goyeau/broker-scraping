// What one round trip costs at Galapagos Capital (Galapagos Capital DTVM):
// buy n shares at price p in the app or the Home Broker, sell them back at
// once, in dollars. A desk order is another line.
//
// The fee page, read on 2026-10-26.
//   https://galapagoscapital.com/investimentos
//
//   Ações e BDRs (App / Home       "Corretagem Lote Padrão App / Home
//   Broker)                        Broker Swing Trade R$4,65",
//                                  "Corretagem Fracionário ... Swing
//                                  Trade R$4,65", "Day Trade R$2,75" (both
//                                  lots). Per order.
//   ETF's (App / Home Broker)      "Swing Trade R$ 0,00", "Day Trade
//                                  R$ 0,00", "Custódia R$ 0,00". Taken as
//                                  the Brazilian ETFs (ISIN BR....CTF...).
//                                  A BDR of a foreign ETF or ETP (ISIN
//                                  BR....BDR...) is a BDR: R$4.65.
//   Mesa de Operações              "Tabela Bovespa", "Mín. R$ 50,00".
//                                  Not online.
//   Custody                        "Custódia ... Não há custos".
//   Taxes                          the page prints no ISS/PIS/COFINS on
//                                  top: R$4.65 as printed.
//   B3                             0.030 % a side, from ../nubank/b3Cost.mjs.
//
// Orders. A share or unit trades in lots of 100; the rest goes to the
// odd-lot book as its own order, so 106.6 PETR4 are two orders a side
// (splitLegs). A BDR or an ETF is one order.
//
// Formula: R$4.65 × orders (R$0 on a Brazilian ETF), each side, + 2 × B3
// + the book. Same day: R$2.75 an order and B3's day-trade rate. Left
// out: the IRRF advance. The account is funded in reais.
//
//   node brokers/galapagos/galapagos_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/galapagos/galapagos_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42

import { makeB3Cost, printB3Cli, perOrder } from "../nubank/b3Cost.mjs";

const PAGE = "https://galapagoscapital.com/investimentos";
const SWING = 4.65;
const DAY = 2.75;

// A Brazilian ETF (not a BDR): zero brokerage.
const freeEtf = (row) => String(row?.type || "").toUpperCase() === "ETF" && String(row?.isin || "").slice(6, 9) !== "BDR";

export const roundTrip = makeB3Cost({
  folder: "galapagos",
  name: "Galapagos",
  catalogue: new URL("galapagos-parsed.json", import.meta.url),
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, row, dayTrade }) => (freeEtf(row) ? 0 : perOrder(legs, () => (dayTrade ? DAY : SWING))),
  basis:
    "Galapagos App / Home Broker : actions et BDR R$ 4,65 par ordre (lot rond et fractionnaire, R$ 2,75 en day trade), ETF brésiliens R$ 0,00, sans droits de garde.",
});

printB3Cli(roundTrip, import.meta.url);
