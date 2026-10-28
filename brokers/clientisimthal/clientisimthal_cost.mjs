// What one round trip costs at Clientis Bank im Thal: buy n shares or ETF
// units on SIX Swiss Exchange through e-Banking ("Direkt", execution only)
// and sell them straight back, in dollars. The SIX book, the federal stamp,
// the SIX exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// "Preise im Wertschriftengeschäft und in der Anlageberatung", "Stand
// September 2024", read on 2026-10-26 (the execution-only page says "Es
// gelten die Gebühren gemäss unseren Preisen für Dienstleistungen im
// Wertschriftengeschäft"):
//   https://bankimthal.clientis.ch/documents/2073690/7848533/BIT_Preise_DL_WS_Geschaeft.pdf
//   "Tarife für Abschlüsse in der Schweiz / An- und Verkauf – Aktien und
//   ähnliche Papiere (Mindestcourtage bis CHF 2'000.00 / CHF 40.00, bis CHF
//   7'272.00 / CHF 80.00)": bis CHF 50'000 1.10 %, bis 100'000 0.90 %, bis
//   200'000 0.70 %, über 200'000 0.45 %.
//   "Für Börsenaufträge über CHF 50'000 wird die Courtage nach obigen
//   Kurswertstufen kumuliert." (slice by slice)
//   "E-Trading: Für den Wertschriftenhandel über e-Banking werden Ihnen
//   jeweils nur 50% der Standardkonditionen berechnet." (minimums included)
//   "Die aufgeführten Preise sind Pauschalpreise ... Gebühren und Abgaben
//   (z.B. eidgenössischer Stempel, Börsenabgaben) werden zusätzlich
//   belastet." (engine)
// So one side online is 50 % x max(minimum, sliced courtage), the minimum
// being CHF 40 up to CHF 2,000 and CHF 80 up to CHF 7,272: CHF 20 / CHF 40
// online. ETFs are taken as "ähnliche Papiere". A SIX trade is a Swiss
// trade whatever the line's currency.
//
// Accounts: Privatkonto (CHF), Eurokonto, and the "Fremdwährungskonto: Das
// Basiskonto zur Abwicklung des Bargeld-, Zahlungs- und
// Wertschriftenverkehrs in einer fremden, frei handelbaren Währung. Für die
// Fremdwährungen EUR und USD gibt es separate Konti."
//   https://bankimthal.clientis.ch/de/privatkunden/konten/zahlkonten
//   https://bankimthal.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
// Every catalogue currency (CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD) is
// freely traded, so no line is converted. No FX markup is printed (the
// "Preise und Gebühren" sheet prices only cash: "Barverkehr über
// Fremdwährungskonten ... 1.0% Agio/Disagio"), so no FX remark.
//
// Left out: the "Abschlüsse im Ausland" column, bonds, funds (own tariff),
// the advisory packages, custody («Direkt» 0.25 % of the deposit a year,
// min CHF 50: remark), tax statement CHF 50, the CHF 250–300 a year fee for
// clients domiciled abroad, VAT (not on courtage).
//
//   node brokers/clientisimthal/clientisimthal_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/clientisimthal/clientisimthal_cost.mjs CSSPX XSWX USD --shares=1 --price=826
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://bankimthal.clientis.ch/documents/2073690/7848533/BIT_Preise_DL_WS_Geschaeft.pdf";
const SLICES = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.009 },
  { upTo: 200000, rate: 0.007 },
  { upTo: Infinity, rate: 0.0045 },
];
const minimumOf = (amountChf) => (amountChf <= 2000 ? 40 : amountChf <= 7272 ? 80 : 0);
const ONLINE_SHARE = 0.5;

export const roundTrip = makeRoundTrip({
  folder: "clientisimthal",
  brand: "Clientis Bank im Thal",
  catalogue: new URL("clientisimthal-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, min CHF 50.",
  sources: { accounts: "https://bankimthal.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto" },
  commission({ amountChf }) {
    const min = minimumOf(amountChf);
    const full = Math.max(min, sliced(SLICES, amountChf));
    const chf = full * ONLINE_SHARE;
    return {
      chf,
      min: min * ONLINE_SHARE,
      rate: chf / amountChf,
      basis:
        `courtage «Abschlüsse in der Schweiz» cumulée par tranches (1,10 % jusqu'à CHF 50 000, 0,90 % jusqu'à 100 000, 0,70 % jusqu'à 200 000, 0,45 % au-delà), ` +
        `minimum CHF 40 jusqu'à CHF 2 000 et CHF 80 jusqu'à CHF 7 272, e-Trading 50 % des conditions standard : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage e-Trading publiée (50 % des conditions standard, minimums compris)",
    };
  },
});

cli(import.meta.url, roundTrip);
