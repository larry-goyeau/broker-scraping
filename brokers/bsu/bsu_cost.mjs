// What one round trip costs at Bank BSU: buy n shares or ETF units on SIX
// Swiss Exchange in the execution-only model (orders placed in E-Banking)
// and sell them straight back, in dollars. The SIX book, the federal stamp,
// taxMap and the FX rule come from ../graubundnerkanto/sixPlaceCost.mjs
// (engine ../migros/sixCost.mjs); this file gives the courtage, the bank's
// own exchange-fee line and the currencies.
//
// "Preise und Gebühren" (Privatkunden / Firmenkunden), read on 2026-10-26:
//   https://www.bankbsu.ch/fileadmin/BankBSU/Dokumente/AGBs/bsu_brosch_preise-gebuehren_privat-firmen.pdf
//   Page 12, Anlagemodell «execution only»: "Abschlüsse in der Schweiz
//   (Mindestcourtage CHF 40) 50 % Reduktion auf den Courtagen-Tarif",
//   footnote 9 "Wenn der Auftrag über den Kundenberater bzw. die
//   Kundenberaterin platziert wird, gilt der normale Tarif."
//   The Courtagen-Tarif, «Portfoliobezogene Anlageberatung», "Tarife für
//   Abschlüsse in der Schweiz", "Aktien und ähnliche Papiere (Mindestcourtage
//   CHF 80)": "bis zu CHF 25'000 1.00 %", "für die nächsten CHF 175'000
//   0.90 %", "über CHF 200'000 0.50 %" (slices). An ETF, ETN or ETC bought
//   on SIX is taken as an "ähnliches Papier" of an "Abschluss in der
//   Schweiz" (the "Anlagefonds" rates there are issue commissions, with
//   "Rücknahme netto").
//   Page 14, "Übrige Tarife": "Börsengebühren Inland (Fremdspesen) pro
//   Abrechnung CHF 3", under "Tarife zuzüglich Mehrwertsteuer": the bank's
//   own exchange-fee line, CHF 3 plus 8.1 % VAT = CHF 3.243 a settlement,
//   in place of the SIX List of Charges. (The "SIX Swiss Exchange Gebühr
//   maximal 0.015 %" line belongs to the «Fondssparplan» table.)
//   Page 13, custody execution only "Erste CHF 500'000 0.25 %",
//   "Minimalgebühr pro Depot CHF 50 / Jahr", plus VAT: a remark.
//   https://www.bankbsu.ch/privatkunden/anlegen/execution-only-modelle
//     trades "direkt im E-Banking"; "In jedem Fall erhalten Sie mit
//     Execution Only 50% Reduktion auf den Courtagen-Tarif."
//
// Commission, one side: half the sliced tariff (0.50 % on the first
// CHF 25,000, 0.45 % on the next 175,000, 0.25 % above 200,000), minimum
// CHF 40; plus the exchange line CHF 3.243.
//
// Accounts: "Eurokonto" and "Fremdwährungskonto" (price list p. 2); the
// Fremdwährungskonto page offers accounts in "frei handelbaren Währungen",
// so every catalogue currency (CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD)
// stays unconverted. No markup for converting a securities settlement is
// printed, so no FX remark.
//   https://www.bankbsu.ch/privatkunden/zahlen-sparen/zahlen/fremdwaehrungskonto
//
// Left out: the adviser tariff (full rate, not online); "Abschlüsse im
// Ausland"; fund issues and the fund savings plan; custody (remark).
//
//   node brokers/bsu/bsu_cost.mjs NESN XSWX CHF --shares=10 --price=81
//   node brokers/bsu/bsu_cost.mjs VWRL XSWX CHF --shares=6 --price=135
//   node brokers/bsu/bsu_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced, printedFee, pctFr } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://www.bankbsu.ch/fileadmin/BankBSU/Dokumente/AGBs/bsu_brosch_preise-gebuehren_privat-firmen.pdf";
const EXECUTION_ONLY = "https://www.bankbsu.ch/privatkunden/anlegen/execution-only-modelle";
const ACCOUNTS = "https://www.bankbsu.ch/privatkunden/zahlen-sparen/zahlen/fremdwaehrungskonto";
const DISCOUNT = 0.5;
const LIST = [
  { upTo: 25000, rate: 0.01 },
  { upTo: 200000, rate: 0.009 },
  { upTo: Infinity, rate: 0.005 },
];
const SLICES = LIST.map((b) => ({ upTo: b.upTo, rate: b.rate * DISCOUNT }));
const MIN = 40;
const VAT = 0.081;
const EXCHANGE_CHF = 3 * (1 + VAT);

export const roundTrip = makeRoundTrip({
  folder: "bsu",
  brand: "Bank BSU",
  catalogue: new URL("bsu-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.25% a year (min CHF 50).",
  sources: { executionOnly: EXECUTION_ONLY, accounts: ACCOUNTS },
  exchangeFee: printedFee({
    groups: { shares: { fix: EXCHANGE_CHF }, etp: { fix: EXCHANGE_CHF } },
    label: "«Börsengebühren Inland (Fremdspesen)» CHF 3 par décompte + TVA 8,1 %",
  }),
  commission: ({ amountChf }) => {
    const chf = sliced(SLICES, amountChf, MIN);
    return {
      chf,
      rate: SLICES[0].rate,
      min: MIN,
      basis:
        `execution only en E-Banking (50 % de réduction sur le tarif de courtage) : ` +
        SLICES.map((b, i) => `${pctFr(b.rate)} % ${i === 0 ? "sur les premiers CHF 25 000" : i === 1 ? "sur les CHF 175 000 suivants" : "au-delà de CHF 200 000"}`).join(", ") +
        `, minimum CHF ${MIN}.`,
      confidence: "barème par tranches publié, réduction execution only appliquée ; ETF traités comme «ähnliche Papiere»",
    };
  },
});

cli(import.meta.url, roundTrip);
