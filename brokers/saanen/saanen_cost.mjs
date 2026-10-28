// What one round trip costs at SB Saanen Bank: buy n shares or ETF units on
// SIX Swiss Exchange through E-Banking and sell them straight back, in
// dollars. The SIX book, the federal stamp, the SIX exchange fee, taxMap and
// the FX rule come from ../graubundnerkanto/sixPlaceCost.mjs (engine
// ../migros/sixCost.mjs); this file gives the courtage and the currencies.
//
// "Dienstleistungs- und Preisübersicht", gültig ab 1. Juli 2026 (sheet
// dated 18.08.2026), read on 2026-10-26:
//   https://www.saanenbank.ch/download/pictures/bb/339e1erfd7zlspdq5cmqidu4x552rv/dienstleistungen_a5_de_18.08.2026.pdf
//   Page 11, "Courtagen", columns "Normaltarif" and "E-Banking":
//     "Aktien / ETFs / Edelmetalle und strukturierte Produkte - in der
//     Schweiz gehandelt": "Minimum pro Auftrag CHF 80.00 | 10.00",
//     "bis CHF 50'000 1.00 % | 0.75 %", "bis CHF 100'000 0.80 % | 0.60 %",
//     "bis CHF 200'000 0.60 % | 0.45 %", "ab CHF 200'000 0.30 % | 0.20 %".
//     "Für sämtliche Anlagefonds gelten die Courtage für Aktien / ETFs
//     Schweiz" (ETF, ETN, ETC and listed funds take the same line).
//     "Kleinstabschlüsse bis Erreichung Minimumgebühr 10 % | 10 %": an order
//     whose 10 % stays under the minimum pays 10 % of its value instead
//     (smallOrder, never above the normal fee; below CHF 100 online).
//     "Gebühren, Abgaben und Fremdspesen werden zusätzlich belastet": no
//     exchange-fee amount is printed, so the official SIX List of Charges
//     (retail order, with the promotions) is used, as the engine does.
//   Page 10, Execution-only custody "Depotgebühren 0.20 %", "Zuschlag
//   Fremdgebühren für Valoren mit Domizil im Ausland 0.10 %",
//   "Minimumgebühr 10.00", "Preise exkl. MWST": a remark.
//
// Commission, one side: the E-Banking band's rate on the whole order in CHF
// (no "gestaffelt" wording: 0.75 % / 0.60 % / 0.45 % / 0.20 %), minimum
// CHF 10, or 10 % of the value when that is lower.
//
// Accounts: the price list prices "Ein- / Auszahlungen auf €-Konti" and "auf
// übrigen Fremdwährungskonti" and converts fees "Bei Fremdwährungskonti ...
// in die jeweilige Währung": CHF and EUR are named; the Kontosortiment
// (01.01.2026) lists a "Fremdwährungskonto" in "Fremdwährungen" without
// naming them, so USD and GBP are taken as the other foreign-currency
// accounts (as for the other banks of the SIX group).
//   https://www.saanenbank.ch/download/pictures/f4/r26sun5vruer6imo8aajl9dx07wsg3/kontosortiment_a5_de_01.01.26.pdf No markup for converting a securities settlement is printed (the
// 1 % Agio/Disagio is for cash in and out of a currency account), so a JPY,
// AUD, CAD or SGD line is N/A.
//
// Left out: the Normaltarif (orders through the securities desk, not an
// online price); the "im Ausland gehandelt" column; Fondsinvest and Privor
// plans; annual fees for clients domiciled abroad ("Diese Dienstleistung
// (e-Trading) steht nur Kunden mit Domizil Schweiz zur Verfügung", e-banking
// page); custody (remark).
//
//   node brokers/saanen/saanen_cost.mjs NESN XSWX CHF --shares=10 --price=81
//   node brokers/saanen/saanen_cost.mjs VWRL XSWX CHF --shares=6 --price=135
//   node brokers/saanen/saanen_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, bandRate, smallOrder, pctFr } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://www.saanenbank.ch/download/pictures/bb/339e1erfd7zlspdq5cmqidu4x552rv/dienstleistungen_a5_de_18.08.2026.pdf";
const BANDS = [
  { upTo: 50000, rate: 0.0075 },
  { upTo: 100000, rate: 0.006 },
  { upTo: 200000, rate: 0.0045 },
  { upTo: Infinity, rate: 0.002 },
];
const MIN = 10;
const SMALL = { rate: 0.1, min: 0 };

export const roundTrip = makeRoundTrip({
  folder: "saanen",
  brand: "Saanen Bank",
  catalogue: new URL("saanen-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.20% a year (0.30% for foreign securities), min CHF 10.",
  commission: ({ amountChf }) => {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    const normal = bandRate(BANDS, amountChf, MIN);
    const chf = smallOrder(normal, amountChf, SMALL);
    return {
      chf,
      rate: band.rate,
      min: MIN,
      basis:
        `tarif E-Banking, actions/ETF négociés en Suisse : ${pctFr(band.rate)} % du montant entier dans sa tranche (` +
        BANDS.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
        `), minimum CHF ${MIN} ; petit ordre : 10 % du montant tant que cela reste sous le minimum` +
        (chf < normal ? ` (appliqué ici : CHF ${Number(chf.toFixed(2))}).` : "."),
      confidence: "barème E-Banking publié, taux de la tranche sur tout l'ordre (aucune mention «gestaffelt»)",
    };
  },
});

cli(import.meta.url, roundTrip);
