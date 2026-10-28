// What one round trip costs at Bank EKI: buy n shares on SIX Swiss
// Exchange from an Execution Only depot in e-banking and sell them straight
// back, in dollars. The SIX book, the Swiss stamp, the SIX exchange fee,
// taxMap and the FX rule come from ../migros/sixCost.mjs; this file gives
// the bank's courtage and its currencies.
//
// Read on 2026-10-26:
//   https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/Prospekte/Gebuehrentarif.pdf
//     (Gebührentarif, valid from 1.1.2026) "Aktien, andere
//     Beteiligungspapiere und Obligationen, Exchange Traded Funds,
//     strukturierte Produkte, Anlagefonds, Derivate", Courtage:
//       Bis zu CHF 50'000.–               0.40 % + Fremdgebühren
//       CHF 50'000.– bis CHF 99'999.–     0.35 % + Fremdgebühren
//       CHF 100'000.– bis CHF 249'999.–   0.25 % + Fremdgebühren
//       CHF 250'000.– bis CHF 499'999.–   0.15 % + Fremdgebühren
//       Über CHF 500'000.–                vollständig aushandelbar
//     "Stufentarif, Berechnung nach dem Bruttowert je Abschluss",
//     "Genereller Mindestansatz CHF 20.– + Fremdgebühren".
//     Depotgebühren, Execution Only 0.25 % a year, minimum CHF 60 a depot
//     (remark).
//   https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/3._Anlegen/Factsheet_Execution_Only.pdf
//     same bands ("bis CHF 50'000 0.40 %" ... "bis CHF 500'000 0.15%"),
//     "Mindestgebühr pro Transaktion CHF 20.00 zuzüglich Fremdgebühren"; no
//     e-banking discount is printed.
//   https://www.bankeki.ch/privatkunden/zahlen/konten/fremdwaehrungskonto
//     "Als Depotkunde ist es Ihnen möglich Ihre Wertschriftentransaktionen
//     direkt in der entsprechenden Fremdwährung zu tätigen", currencies USD,
//     CAD, AUD, NZD, HKD, JPY, SEK, DKK, GBP, ZAR, NOK; plus the Euro-Konto.
//
// Commission, one side: the band's rate on the gross value of the order in
// CHF ("Berechnung nach dem Bruttowert je Abschluss"), minimum CHF 20.
// Above CHF 500,000 the rate is negotiable, so the total is unknown. The
// "Fremdgebühren" are the exchange's fees (SIX list, added by the engine).
//
// FX: CHF, EUR and the eleven currencies above are deposit currencies.
// No markup is printed, so the one SGD line is N/A.
//
// Left out: other asset classes, issues, custody minimum per position
// (CHF 10), VAT on custody, CHF 240 a year for clients domiciled abroad.
//
//   node brokers/eki/eki_cost.mjs NESN XSWX CHF --shares=12 --price=80
//   node brokers/eki/eki_cost.mjs CSSPX XSWX USD --shares=2 --price=650
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/Prospekte/Gebuehrentarif.pdf";
const FACTSHEET = "https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/3._Anlegen/Factsheet_Execution_Only.pdf";
const ACCOUNTS = "https://www.bankeki.ch/privatkunden/zahlen/konten/fremdwaehrungskonto";
const MIN = 20;
const NEGOTIABLE = 500000;
// "bis zu 50'000" inclusive, then "50'000 bis 99'999", "100'000 bis 249'999", "250'000 bis 499'999".
const BANDS = [
  { upTo: 50000, rate: 0.004, inclusive: true },
  { upTo: 100000, rate: 0.0035 },
  { upTo: 250000, rate: 0.0025 },
  { upTo: NEGOTIABLE, rate: 0.0015 },
];

export const roundTrip = makeRoundTrip({
  folder: "eki",
  brand: "Bank EKI",
  catalogue: new URL("eki-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "CAD", "AUD", "NZD", "HKD", "JPY", "SEK", "DKK", "GBP", "ZAR", "NOK"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.25% a year (min CHF 60).",
  sources: { factsheet: FACTSHEET, accounts: ACCOUNTS },
  commission: ({ amountChf }) => {
    const basis =
      `Execution Only : ` + BANDS.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
      ` (jusqu'à CHF 50 000 / 100 000 / 250 000 / 500 000) du montant brut de l'ordre, minimum CHF ${MIN}.`;
    const band = BANDS.find((b) => (b.inclusive ? amountChf <= b.upTo : amountChf < b.upTo)) ?? (amountChf <= NEGOTIABLE ? BANDS[BANDS.length - 1] : null);
    if (!band) return { chf: null, min: MIN, basis: `${basis} Au-delà de CHF ${NEGOTIABLE} la courtage est « vollständig aushandelbar ».` };
    return {
      chf: Math.max(MIN, amountChf * band.rate),
      rate: band.rate,
      min: MIN,
      basis,
      confidence: "barème publié (« Stufentarif ») lu comme taux de la tranche sur le montant brut entier",
    };
  },
});

cli(import.meta.url, roundTrip);
