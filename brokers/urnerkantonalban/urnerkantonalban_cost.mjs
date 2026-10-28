// What one round trip costs at Urner Kantonalbank (UKB): buy n shares or
// ETF units on SIX Swiss Exchange through E-Banking and sell them straight
// back, in dollars. The SIX book, the federal stamp, the SIX fee, taxMap
// and the conversion are ../migros/sixCost.mjs; this file gives the
// courtage and the account currencies.
//
// Factsheet "Konditionen im Anlagegeschäft" (© UKB 05.2026), read on
// 2026-10-26; https://www.ukb.ch/anlegen-tarife redirects to it:
//   https://www.ukb.ch/dam/dokumente/private/sparen-und-anlegen/Factsheet-Konditionen-im-Anlagegeschaeft.pdf
//   "Transaktionsgebühren", CHF transaction volume, "Staffeltarif" (each
//   slice at its own rate):
//                        Aktien, strukturierte       Aktienfonds, ETF,
//                        Produkte ... Inland          ... In- und Ausland
//     0 – 25'000                1.10 %                      1.20 %
//     25'001 – 50'000           1.00 %                      1.20 %
//     50'001 – 100'000          0.80 %                      0.90 %
//     100'001 – 150'000         0.60 %                      0.90 %
//     150'001 – 200'000         0.40 %                      0.90 %
//     200'001 – 250'000         0.30 %                      0.90 %
//     250'001 – 500'000         0.20 %                      0.70 %
//     ab 500'001                0.10 %                      0.50 %
//   "Rabatt für Online-Transaktionen 50 %", "Minimumgebühr für
//   Online-Transaktionen CHF 40" (CHF 80 otherwise).
//   "Die aktuell gültigen Börsengebühren, gesetzlichen Abgaben und Steuern
//   werden zusätzlich verrechnet" (the SIX fee and the stamp, "0.075 % bei
//   inländischen Wertpapieren | 0.150 % bei ausländischen Wertpapieren",
//   in the engine).
// Shares, ETN and ETC (structured products) take the Inland column, read
// as the trading place, for a foreign share on SIX too; every ETF takes the
// fund/ETF column (the factsheet names "ETF" there; its separate bond-fund
// and money-market columns are lower, and a bond ETF is left on the ETF
// column). Each side: max(CHF 40, 50 % of the slices).
// Custody, Wertschriftendepot Plus: "Depotgebühr 0.40 % bis CHF 1 Mio.",
// "Minimumgebühr CHF 100", "Postengebühr pro Valor CHF 20", plus 0.15 % on
// titles domiciled abroad and VAT: a remark.
//
// Accounts: CHF accounts, a Eurokonto and a "Fremdwährungskonto" with
// which "wickeln Sie weltweite Zahlungen oder Börsenaufträge ganz einfach
// und ohne Währungsverluste ab. Unser Angebot umfasst Währungen aus allen
// Kontinenten": every currency of the SIX book (CHF, EUR, USD, GBP, JPY,
// AUD, CAD, SGD) can be held, so nothing is converted. UKB prints no
// conversion margin, so no FX remark.
//   https://www.ukb.ch/private/konten-und-karten/konten/fremdwaehrungskonto
//
// Left out: the "CHF 20 pro Posten/Valor" for the bank's effective
// outlays (special handling), foreign exchanges, bonds, the custody fees
// and the quarterly fee for clients domiciled abroad: not per trade.
//
//   node brokers/urnerkantonalban/urnerkantonalban_cost.mjs NESN XSWX CHF --shares=13 --price=77.46
//   node brokers/urnerkantonalban/urnerkantonalban_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/urnerkantonalban/urnerkantonalban_cost.mjs NESN XSWX CHF --shares=1000 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://www.ukb.ch/anlegen-tarife";
const PDF = "https://www.ukb.ch/dam/dokumente/private/sparen-und-anlegen/Factsheet-Konditionen-im-Anlagegeschaeft.pdf";
const ONLINE = 0.5;
const MIN_CHF = 40;
const LIMITS = [25000, 50000, 100000, 150000, 200000, 250000, 500000, Infinity];
const slices = (rates) => LIMITS.map((upTo, i) => ({ upTo, rate: rates[i] * ONLINE }));
const SHARES = slices([0.011, 0.01, 0.008, 0.006, 0.004, 0.003, 0.002, 0.001]);
const FUNDS = slices([0.012, 0.012, 0.009, 0.009, 0.009, 0.009, 0.007, 0.005]);

export const roundTrip = makeRoundTrip({
  folder: "urnerkantonalban",
  brand: "Urner Kantonalbank",
  catalogue: new URL("urnerkantonalban-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.4% a year, min CHF 100, plus CHF 20 a line.",
  sources: { pdf: PDF, accounts: "https://www.ukb.ch/private/konten-und-karten/konten/fremdwaehrungskonto" },
  commission({ amountChf, row }) {
    const fund = String(row?.type || "").toUpperCase() === "ETF";
    const fee = sliced(fund ? FUNDS : SHARES, amountChf, MIN_CHF);
    const first = (fund ? FUNDS : SHARES)[0].rate;
    return {
      chf: fee,
      rate: first,
      min: MIN_CHF,
      basis:
        `${fund ? "colonne «Aktienfonds, ETF ... In- und Ausland»" : "colonne «Aktien, strukturierte Produkte ... Inland»"}, ` +
        `tarif échelonné (chaque tranche à son taux), rabais en ligne de 50 % (${pctFr(first)} % sur les premiers CHF 25 000), ` +
        `minimum en ligne CHF ${MIN_CHF}.`,
      confidence: "rabais et minimum en ligne imprimés ; «Staffeltarif» lu par tranches ; «Inland» lu comme la place de cotation",
    };
  },
});

cli(import.meta.url, roundTrip);
