// What one round trip costs at Bank Gantrisch: buy n shares or ETF units
// on SIX Swiss Exchange through E-Banking or the Mobile Banking App and
// sell them back, in dollars. The SIX book, the federal stamp, the SIX
// exchange fee, taxMap and the dollar answer come from ../migros/sixCost.mjs.
//
// "Gebührentarif, gültig ab 1. Januar 2026", read on 2026-10-26:
//   https://www.bankgantrisch.ch/images/content/Broschueren_Dokumente/Bank_Gantrisch_Gebuhrentarif.pdf
// Courtagetarif, "Aktien* Inland": minimum CHF 60; "Aufträge bis
// CHF 25'000.– 1.00 %", "ab CHF 25'000.– bis CHF 50'000.– 0.90 %",
// "darüber 0.70 %" (the rate of the order's band on the whole order);
// "*Fremdspesen werden weiterbelastet". "Aufträge via E-Banking / Mobile
// Banking App: 50 % Rabatt auf jeweiligem Tarif, Minimum CHF 30.–". So one
// side online is
//   max(CHF 30, 50 % x max(CHF 60, band rate x amount)).
// A SIX trade is an "Inland" trade whatever the line's currency or ISIN
// (the "Ausland" column, minimum CHF 100, 1.40 %, is for foreign
// exchanges). ETFs and ETPs take the share tariff: the "Anlagefonds" lines
// (money-market, bond and equity funds, minimum CHF 80) are fund
// subscriptions, and the depot table already ranks "ETF's" with shares at
// 0.25 %. The brochure "Geldanlagen" prints the same execution-only price,
// "ab 1.00 %, min. CHF 60.–, 50 % Rabatt via E-Banking oder Mobile Banking
// App":
//   https://www.bankgantrisch.ch/images/content/Broschueren_Dokumente/Bank_Gantrisch_Geldanlagen.pdf
//
// Accounts: "Eurokonto" and a "Fremdwährungskonto", both "als Ergänzung
// zum Wertschriftendepot" (https://www.bankgantrisch.ch/Privat/Zahlen/Konten);
// the foreign-currency account is held "in der gewünschten Fremdwährung"
// and its page names only USD ("Kreditkarte (nur in USD)",
// https://www.bankgantrisch.ch/Privat/Zahlen/Konten/fremdwaehrungskonto),
// so CHF, EUR and USD are kept. No FX markup on account conversions is
// printed (the 1 % "Agio / Disagio" is for banknotes), so a
// GBP/JPY/AUD/... line, converted both ways, is N/A.
//
// Left out: depot fee 0.25 % a year on shares and ETFs, at least CHF 50
// (remark); the advisory model (same courtage, 0.40 % a year); mandates;
// VAT (not on courtage).
//
//   node brokers/gantrisch/gantrisch_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE = "https://www.bankgantrisch.ch/images/content/Broschueren_Dokumente/Bank_Gantrisch_Gebuhrentarif.pdf";
const BANDS = [
  { upTo: 25000, rate: 0.01 },
  { upTo: 50000, rate: 0.009 },
  { upTo: Infinity, rate: 0.007 },
];
const MIN = 60;
const DISCOUNT = 0.5;
const MIN_ONLINE = 30;

export const roundTrip = makeRoundTrip({
  folder: "gantrisch",
  brand: "Bank Gantrisch",
  catalogue: new URL("gantrisch-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 50.",
  sources: {
    brochure: "https://www.bankgantrisch.ch/images/content/Broschueren_Dokumente/Bank_Gantrisch_Geldanlagen.pdf",
    accounts: "https://www.bankgantrisch.ch/Privat/Zahlen/Konten",
    fxAccount: "https://www.bankgantrisch.ch/Privat/Zahlen/Konten/fremdwaehrungskonto",
  },
  commission({ amountChf }) {
    const full = bandRate(BANDS, amountChf, MIN);
    const chf = Math.max(MIN_ONLINE, full * DISCOUNT);
    return {
      chf,
      min: MIN_ONLINE,
      basis:
        `courtage «Aktien Inland» (1 % jusqu'à CHF 25 000, 0,90 % jusqu'à 50 000, 0,70 % au-delà, taux de la tranche sur tout l'ordre, minimum CHF 60), ` +
        `rabais E-Banking 50 %, minimum CHF 30 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage en ligne imprimée (50 % du tarif, minimum CHF 30) ; ETF et ETP au tarif des actions, une ligne SIX au tarif «Inland»",
    };
  },
});

cli(import.meta.url, roundTrip);
