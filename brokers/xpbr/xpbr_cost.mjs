// What one round trip costs at XP Investimentos: buy n shares at price p on
// the electronic platforms ("Autoatendimento"), sell them back at once, in
// dollars. B3 lines in reais; US lines and the LSE's dollar UCITS ETF lines
// in the Conta Investimento Global, held at XP Investments US, LLC. Desk,
// adviser and "push" orders are other lines.
//
// The cost page, read on 2026-10-26 (the newest Wayback copy; the live page
// answers scripts with 403):
//   https://www.xpi.com.br/custos-operacionais/
//
// B3 ("Autoatendimento: Ordens executadas pelo próprio cliente nas
// plataformas eletrônicas de negociação"):
//   Ações e BDRs                   "Day Trade aderindo ao RLP: R$ 0,00 Day
//                                  Trade não aderindo ao RLP: R$ 2,90 Swing
//                                  Trade: R$ 4,90", per executed order.
//                                  ETFs trade on the same Bovespa ticket
//                                  (Monte Bravo, XP's PNA, prints "Ações /
//                                  BDR / ETF"). RLP is an opt-in: R$2.90
//                                  used for the same day.
//   Taxes                          "As corretagens ... terão um acréscimo
//                                  referente ao ISS, PIS, COFINS" (5 %,
//                                  0.65 %, 4 %): × 1.0965.
//   Outros Bovespa                 "cobra uma taxa operacional de 5,9%
//                                  sobre o valor da corretagem,
//                                  emolumentos e taxa de liquidação": on
//                                  the brokerage and on B3's negociação
//                                  (0.005 %) + liquidação (0.0224 %).
//   Custody                        "Taxa de custódia XP R$ 0,00".
//   B3                             0.030 % a side, ../nubank/b3Cost.mjs.
//   Same formula as ../montebravo/montebravo_cost.mjs (XP is its clearer).
//   A share or unit trades in lots of 100; the rest is an odd-lot order of
//   its own (splitLegs), so 106.6 PETR4 are two orders a side.
//
// Conta Investimento Global (../xpbr/xpGlobal.mjs, the same table Rico
// prints): US shares, ETFs, REITs and ADRs U$1.00 up to $100, U$1.50 up
// to $1,000, U$4.30 up to $2,000, U$8.60 above, per order; UCITS ETFs
// 0.25 %, minimum U$5.00, per order. No SEC, TAF or CAT line: 0. The
// account holds dollars (deposits.mjs: BRL, USD), so no FX in the total;
// the remark gives the spread for the Digital segment up to R$15,000 and
// the IOF: "FX 2.25% + IOF 1.1% when cash ≠ USD."
//
// Book: B3 and the LSE read their own venue's leaf. A US line uses the 606
// of XP Investments US, LLC (CRD 156691, files its own report) once
// spreads/rule606.mjs maps "xpbr" to it; until then the quoted NBBO.
//
// Left out: the IRRF advance on a B3 sale, the B3 custody line of the
// adviser segment, ACAT/DRS transfers.
//
//   node brokers/xpbr/xpbr_cost.mjs PETR4 B3 BRL --shares=106.6 --price=48.07
//   node brokers/xpbr/xpbr_cost.mjs BOVA11 B3 BRL --shares=25.3 --price=202.42
//   node brokers/xpbr/xpbr_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/xpbr/xpbr_cost.mjs CSPX "London Stock Exchange" USD --shares=10 --price=700
//
// `roundTrip(...)` reads files, not the network.

import { makeB3Cost, withTaxes, real, NEGOTIATION, CCP, DAY_TRADE } from "../nubank/b3Cost.mjs";
import { makeLineCost, printLineCli } from "./lineCost.mjs";
import { xpGlobalPrice } from "./xpGlobal.mjs";

const PAGE = "https://www.xpi.com.br/custos-operacionais/";
const CATALOGUE = new URL("xpbr-parsed.json", import.meta.url);
const SWING = 4.9;
const DAY = 2.9;
const OPERATIONAL = 0.059;

const b3 = makeB3Cost({
  folder: "xpbr",
  name: "XP",
  catalogue: CATALOGUE,
  url: PAGE,
  readOn: "2026-10-26",
  brokerage: ({ legs, notional, dayTrade }) => {
    const brokerage = legs.length * (dayTrade ? DAY : SWING);
    const fees = notional * (dayTrade ? DAY_TRADE : NEGOTIATION + CCP);
    return real(withTaxes(brokerage) + OPERATIONAL * (brokerage + fees));
  },
  basis:
    "XP autoatendimento : actions, BDR et ETF R$ 4,90 par ordre (R$ 2,90 en day trade hors RLP), + ISS 5 %, PIS 0,65 %, COFINS 4 %, + taxe opérationnelle de 5,9 % sur le courtage, les émoluments et la liquidation.",
  confidence: "medium",
});

export const roundTrip = makeLineCost({
  folder: "xpbr",
  name: "XP",
  catalogue: CATALOGUE,
  url: PAGE,
  price: xpGlobalPrice({ brand: "XP" }),
  delegate: (row) => (row.mic === "BVMF" ? b3 : null),
});

printLineCli(roundTrip, import.meta.url);
