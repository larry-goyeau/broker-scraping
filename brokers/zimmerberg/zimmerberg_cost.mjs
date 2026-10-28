// What one round trip costs at Bank Zimmerberg: buy n shares on SIX Swiss
// Exchange in e-banking without advice and sell them straight back, in
// dollars. The SIX book, the Swiss stamp, the SIX exchange fee, taxMap and
// the FX rule come from ../migros/sixCost.mjs; this file gives the bank's
// courtage and its currencies.
//
// Read on 2026-10-26:
//   https://www.bankzimmerberg.ch/app/uploads/2025/06/Konditionen-im-Anlagegeschaeft_gueltig-ab-1.4.24.pdf
//     "Transaktionspreise für einzelne Anlageinstrumente", "Aktien, ETF,
//     strukturierte Produkte, Derivate", "In der Schweiz gehandelt", on the
//     gross value of the order in CHF:
//       bis 50'000 1.00 %, bis 100'000 0.90 %, bis 150'000 0.80 %,
//       bis 200'000 0.70 %, bis 300'000 0.55 %, bis 400'000 0.40 %,
//       ab 400'000 0.30 %; Minimum pro Auftrag CHF 80.
//     "Massgebend für die Bestimmung des anzuwenden Satzes ist das
//     Handelsvolumen pro Valor des jeweiligen Auftrags" (the band's rate on
//     the whole order). "Bei Fremdwährungs-Abschlüssen dient als
//     Berechnungsgrundlage der Gegenwert in Schweizer Franken."
//     "Auf Aufträgen via E-Banking ohne vorangegangene Beratung wird auf
//     allen Transaktions- und Mindestpreisen ein Rabatt von 50% gewährt."
//     "Externe Gebühren wie Börsengebühren, Umsatzabgaben und übrige
//     Steuern ... werden separat verrechnet."
//     Selbstbedienung (execution only) 0.25 % a year on the deposit,
//     minimum CHF 30 (remark).
//   https://www.bankzimmerberg.ch/app/uploads/2025/07/Zahlen-und-Sparen_Juli26.pdf
//     Privatkonto / Kontokorrent (CHF) and Eurokonto (EUR), "Kontoführung
//     in weiteren Fremdwährungen auf Anfrage".
//
// Commission, one side: half the band rate on the whole amount
// (0.50 %, 0.45 %, 0.40 %, 0.35 %, 0.275 %, 0.20 %, 0.15 %), minimum CHF 40.
// "Grössere Transaktionen auf Anfrage" is not priced; the printed
// "ab 400'000" rate is kept.
//
// FX: CHF and EUR are held (other currencies only "auf Anfrage", left out
// as in migros_cost.mjs). No markup is printed, so a USD, GBP, JPY, AUD,
// CAD or SGD line is N/A.
//
// Left out: the "Im Ausland gehandelt" column, bonds, funds (issue and
// redemption), 0.075 % custody surcharge on titles held abroad, VAT on
// custody.
//
//   node brokers/zimmerberg/zimmerberg_cost.mjs NESN XSWX CHF --shares=12 --price=80
//   node brokers/zimmerberg/zimmerberg_cost.mjs CSSX5E XSWX EUR --shares=5 --price=200
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, bandRate, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://www.bankzimmerberg.ch/app/uploads/2025/06/Konditionen-im-Anlagegeschaeft_gueltig-ab-1.4.24.pdf";
const ACCOUNTS = "https://www.bankzimmerberg.ch/app/uploads/2025/07/Zahlen-und-Sparen_Juli26.pdf";
const DISCOUNT = 0.5;
const LIST = [
  { upTo: 50000, rate: 0.01 },
  { upTo: 100000, rate: 0.009 },
  { upTo: 150000, rate: 0.008 },
  { upTo: 200000, rate: 0.007 },
  { upTo: 300000, rate: 0.0055 },
  { upTo: 400000, rate: 0.004 },
  { upTo: Infinity, rate: 0.003 },
];
const BANDS = LIST.map((b) => ({ upTo: b.upTo, rate: b.rate * DISCOUNT }));
const MIN = 80 * DISCOUNT;

export const roundTrip = makeRoundTrip({
  folder: "zimmerberg",
  brand: "Bank Zimmerberg",
  catalogue: new URL("zimmerberg-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.25% a year (min CHF 30).",
  sources: { accounts: ACCOUNTS },
  commission: ({ amountChf }) => {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    return {
      chf: bandRate(BANDS, amountChf, MIN),
      rate: band.rate,
      min: MIN,
      basis:
        `ordre e-banking sans conseil (rabais de 50 % sur les prix de transaction et le minimum) : ` +
        `${pctFr(band.rate)} % du montant entier dans sa tranche (` +
        BANDS.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
        `), minimum CHF ${MIN}.`,
      confidence: "barème publié, taux de la tranche sur tout l'ordre, rabais e-banking appliqué",
    };
  },
});

cli(import.meta.url, roundTrip);
