// What one round trip costs at Obwaldner Kantonalbank (OKB): buy n shares
// or ETF units on SIX Swiss Exchange through E-Banking and sell them
// straight back, in dollars. The SIX book, the federal stamp, taxMap and
// the conversion are ../migros/sixCost.mjs (through
// ../graubundnerkanto/sixPlaceCost.mjs); this file gives the courtage, the
// bank's own exchange-fee line and the account currencies.
//
// "Preisliste", 1. Oktober 2026, read on 2026-10-26:
//   https://www.okb.ch/.dam/01d39e05-351f-4923-94d0-4fb81d40b6f4/OKB-Preisliste.pdf
//   p. 14 "Transaktionsgebühren", "Volumen in CHF (brutto)":
//                               Aktien      Fonds
//     bis 49'999.99             1,00 %      1,30 %
//     50'000.00 bis 99'999.99   0,80 %      1,10 %
//     100'000.00 bis 249'999.99 0,40 %      0,90 %
//     250'000.00 bis 499'999.99 0,30 %      0,70 %
//     ab 500'000.00             0,10 %      0,50 %
//   "Minimum Online (Rabatt E-Banking) CHF 40.00"; "Rabatt E-Banking 50 %
//   auf Transaktionsgebühren, CHF 40.00 Minimumgebühren".
//   "Tarif Aktien: Aktien, ..., Exchange Traded Funds (ETF), Exchange
//   Traded Commodities (ETC), und ähnliche Papiere (Schweiz und Ausland)";
//   "Tarif Fonds: Anlagefonds" (a FUND row).
//   The E-Depot page prints the same online scale (Aktien "0.500 %" to
//   49,999.99, "CHF 40.00" minimum):
//   https://www.okb.ch/private/anlegen/weitere-anlageprodukte/e-depot
//   p. 16 "Börsengebühr" (per side, "in CHF oder Gegenwert in
//   Fremdwährung"):
//     "Aktien und ähnliche Papiere (Abschlüsse an der SIX) 0,005 %, Minimal
//     CHF 1.50, Maximal CHF 65.00"
//     "Derivate Instrumente ETF, Anlagefonds (Scoach) 0,015 %, CHF 2.00,
//     CHF 150.00"
//   This printed line replaces the SIX list (and its promotions).
// So each side: max(CHF 40, half the band rate x the whole amount), plus
// the printed exchange fee. The stamp is the engine's.
// Custody: "Wertpapiere 0,25 % pro Position vom Marktwert", "E-Depot ...
// CHF 50.00" a year minimum (p. 12): a remark.
//
// Accounts: Privatkonto Euro and "Privatkonto Fremdwährung": "Zahlungen in
// USD, GBP oder weiteren gängigen Währungen", "Zinssatz gilt für USD, CAD
// und GBP", other currencies "auf Anfrage":
//   https://www.okb.ch/private/konten-und-karten/privatkonten/privatkonto-fremdwaehrung
// Every currency of the SIX book is taken as holdable (JPY, AUD and SGD on
// request), so nothing is converted. OKB prints only a cash agio and "zu
// einem branchenüblichen Devisenverkaufskurs" (cards), no securities
// margin, so no FX remark.
//
// Left out: the offline price (CHF 80 minimum), bonds, options, futures,
// rights, the custody fee in the total, and fund classes reserved to
// advisory mandates.
//
//   node brokers/obwaldnerkantona/obwaldnerkantona_cost.mjs NESN XSWX CHF --shares=11 --price=77.46
//   node brokers/obwaldnerkantona/obwaldnerkantona_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/obwaldnerkantona/obwaldnerkantona_cost.mjs NESN XSWX CHF --shares=100 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr, printedFee } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://www.okb.ch/.dam/01d39e05-351f-4923-94d0-4fb81d40b6f4/OKB-Preisliste.pdf";
const EDEPOT = "https://www.okb.ch/private/anlegen/weitere-anlageprodukte/e-depot";
const ACCOUNTS = "https://www.okb.ch/private/konten-und-karten/privatkonten/privatkonto-fremdwaehrung";
const ONLINE = 0.5;
const MIN_CHF = 40;
const LIMITS = [49999.99, 99999.99, 249999.99, 499999.99, Infinity];
const bands = (rates) => LIMITS.map((upTo, i) => ({ upTo, rate: rates[i] * ONLINE }));
const SHARES = bands([0.01, 0.008, 0.004, 0.003, 0.001]);
const FUNDS = bands([0.013, 0.011, 0.009, 0.007, 0.005]);

export const roundTrip = makeRoundTrip({
  folder: "obwaldnerkantona",
  brand: "Obwaldner Kantonalbank",
  catalogue: new URL("obwaldnerkantona-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, min CHF 50.",
  sources: { eDepot: EDEPOT, accounts: ACCOUNTS },
  exchangeFee: printedFee({
    groups: {
      shares: { pct: 0.00005, min: 1.5, max: 65 },
      etp: { pct: 0.00015, min: 2, max: 150 },
    },
    label: "Börsengebühr du tarif OKB",
  }),
  commission({ amountChf, row }) {
    const fund = String(row?.type || "").toUpperCase() === "FUND";
    const table = fund ? FUNDS : SHARES;
    const band = table.find((b) => amountChf <= b.upTo);
    return {
      chf: bandRate(table, amountChf, MIN_CHF),
      rate: band.rate,
      min: MIN_CHF,
      basis:
        `${fund ? "«Tarif Fonds»" : "«Tarif Aktien» (actions, ETF, ETC, Suisse et étranger)"}, taux de la tranche sur tout le montant brut, ` +
        `rabais E-Banking de 50 % : ici ${pctFr(band.rate)} %, minimum en ligne CHF ${MIN_CHF}.`,
      confidence: "rabais et minimum E-Banking imprimés (même barème sur la page E-Depot)",
    };
  },
});

cli(import.meta.url, roundTrip);
