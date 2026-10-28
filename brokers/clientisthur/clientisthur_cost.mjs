// What one round trip costs at Clientis Bank Thur: buy n shares or ETF
// units on SIX Swiss Exchange through e-Banking ("Execution only: «Direkt»")
// and sell them straight back, in dollars. The SIX book, the federal stamp,
// the SIX exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// Factsheet "Execution only – Selbst entscheiden und wählen", read on
// 2026-10-26 (page 2 is the same "Courtage-Tarif" as
// https://bankthur.clientis.ch/documents/2050824/4685435/BAT_Preise_DL_WS_Geschaeft.pdf):
//   https://bankthur.clientis.ch/documents/2050824/4685435/bat-factsheet-execution-only.pdf
//   "Courtage: Tarife gemäss Rückseite", "e-Banking-Rabatt auf Courtage
//   50 %", "Depotpreis p.a. 0.30 %, Minimum p.a. CHF 50.00".
//   "Tarife für Abschlüsse in der Schweiz: Kauf und Verkauf – Aktien,
//   Obligationen, strukturierte Derivate, ETF, Immobilienfonds, übrige
//   Anlageinstrumente, Mindestcourtage CHF 100.00": bis CHF 100'000 1.10 %,
//   bis 200'000 0.90 %, bis 300'000 0.70 %, bis 400'000 0.55 %, bis 500'000
//   0.45 %, ab 500'000 0.40 %. No "kumuliert" or "für die nächsten", so the
//   band's rate is taken on the whole amount (as in clientissparundl_cost.mjs).
//   "Börsen- und Steuerabgaben werden getrennt verrechnet." (engine)
// The 50 % e-Banking discount is "auf Courtage"; the sheet's only "Die
// Minimalpreise werden nicht reduziert" is the custody footnote (pro-rata
// depot prices), so the discount is applied to the charged courtage,
// minimum included: one side online is 50 % x max(CHF 100, band rate x
// amount), at least CHF 50. A SIX trade is a Swiss trade whatever the
// line's currency.
//
// Accounts: Privatkonto (CHF), Eurokonto, and the "Fremdwährungskonto: Das
// Basiskonto zur Abwicklung des Bargeld-, Zahlungs- und
// Wertschriftenverkehrs in einer fremden, frei handelbaren Währung. Für die
// Fremdwährungen EUR und USD gibt es separate Konti."
//   https://bankthur.clientis.ch/de/privatkunden/konten/zahlkonten
//   https://bankthur.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
// Every catalogue currency (CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD) is
// freely traded, so no line is converted. No FX markup is printed (the
// "Preise für andere Dienstleistungen" sheet has none), so no FX remark.
//
// Left out: the "Abschlüsse im Ausland" column, funds (own tariff),
// custody (0.30 % a year, min CHF 50: remark), tax statement (CHF 80 a
// year, optional), the CHF 250 a year fee for clients domiciled abroad,
// VAT (not on courtage).
//
//   node brokers/clientisthur/clientisthur_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/clientisthur/clientisthur_cost.mjs CSSPX XSWX USD --shares=1 --price=826
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE = "https://bankthur.clientis.ch/documents/2050824/4685435/bat-factsheet-execution-only.pdf";
const BANDS = [
  { upTo: 100000, rate: 0.011 },
  { upTo: 200000, rate: 0.009 },
  { upTo: 300000, rate: 0.007 },
  { upTo: 400000, rate: 0.0055 },
  { upTo: 500000, rate: 0.0045 },
  { upTo: Infinity, rate: 0.004 },
];
const MIN = 100;
const DISCOUNT = 0.5;

export const roundTrip = makeRoundTrip({
  folder: "clientisthur",
  brand: "Clientis Bank Thur",
  catalogue: new URL("clientisthur-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.30% a year, min CHF 50.",
  sources: {
    tariff: "https://bankthur.clientis.ch/documents/2050824/4685435/BAT_Preise_DL_WS_Geschaeft.pdf",
    accounts: "https://bankthur.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto",
  },
  commission({ amountChf }) {
    const full = bandRate(BANDS, amountChf, MIN);
    const chf = full * DISCOUNT;
    return {
      chf,
      min: MIN * DISCOUNT,
      rate: chf / amountChf,
      basis:
        `courtage «Abschlüsse in der Schweiz» (1,10 % jusqu'à CHF 100 000, 0,90 % jusqu'à 200 000, 0,70 % jusqu'à 300 000, 0,55 % jusqu'à 400 000, 0,45 % jusqu'à 500 000, 0,40 % au-delà, taux de la tranche sur tout le montant, minimum CHF 100), ` +
        `rabais e-Banking 50 % : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage publiée ; rabais e-Banking 50 % appliqué aussi au minimum (la fiche ne dit pas qu'il en est exclu)",
    };
  },
});

cli(import.meta.url, roundTrip);
