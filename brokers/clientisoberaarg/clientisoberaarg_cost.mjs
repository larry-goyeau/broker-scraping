// What one round trip costs at Clientis Bank Oberaargau: buy n shares or
// ETF units on SIX Swiss Exchange through e-Banking and sell them straight
// back, in dollars. The SIX book, the federal stamp, the SIX exchange fee,
// taxMap and the dollar answer come from ../migros/sixCost.mjs.
//
// "Preise für Dienstleistungen im Wertschriftengeschäft", "Stand Januar
// 2026", read on 2026-10-26 (it applies to "Execution Only" and the
// advisory models alike):
//   https://bankoberaargau.clientis.ch/documents/2043432/4745831/BOA_Preise_Dienstleistungen_Wertschriftengeschaeft.pdf
//   "Courtage – Börsentransaktionen (bis CHF 800.- 10 %, darüber mind. CHF
//   80.-)": bis zu CHF 50'000 1,10 %, "für die nächsten" CHF 50'000 1,00 %,
//   50'000 0,80 %, 50'000 0,60 %, 50'000 0,40 %, 250'000 0,30 %, "über CHF
//   500'000" 0,20 % (slice by slice).
//   "Abschlüsse via e-Banking und Mobile Banking App: 60 % der ordentlichen
//   Courtage, mind. CHF 50.- (bis CHF 500.- 10 %) + Fremdspesen".
// So one side online is 10 % of the amount up to CHF 500, otherwise
// max(CHF 50, 60 % of the sliced courtage). A SIX trade is not an
// "Abschluss im Ausland" whatever the line's currency.
// The exchange's fees and the stamp are not in the courtage (engine).
//
// Accounts: Privatkonto (CHF) and the "Fremdwährungskonto", "Das Basiskonto
// zur Abwicklung des Bargeld-, Zahlungs-, und Wertschriftenverkehrs in
// Fremdwährungen", "Bar- und Zahlungsverkehr in EUR, USD und GBP, weitere
// Währungen auf Anfrage":
//   https://bankoberaargau.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
//   https://bankoberaargau.clientis.ch/documents/2043432/17686233/boa-factsheet-fremdwaehrungskonto.pdf
// So CHF, EUR, USD and GBP lines stay unconverted. FX: the "Preise und
// Gebühren" sheet prices cash over the counter only ("Barverkehr über
// Fremdwährungskonti 1 % Agio/Disagio", "Change-Geschäfte ... für Kunden
// kostenlos") and prints no conversion markup, so a JPY, AUD, CAD or SGD
// line (converted both ways) is N/A.
//   https://bankoberaargau.clientis.ch/documents/2043432/4745831/BOA_Preise_und_Gebuehren.pdf
//
// Left out: the advisory models, Clientis and third-party funds (other
// tariffs), foreign exchanges, custody (0.35 % a year, +0.15 % on foreign
// values, min CHF 60, CHF 5 a position: remark), the CHF 900 a year fee for
// clients domiciled abroad, VAT (not on courtage).
//
//   node brokers/clientisoberaarg/clientisoberaarg_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/clientisoberaarg/clientisoberaarg_cost.mjs CSSPX XSWX USD --shares=1 --price=826
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://bankoberaargau.clientis.ch/documents/2043432/4745831/BOA_Preise_Dienstleistungen_Wertschriftengeschaeft.pdf";
const SLICES = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.01 },
  { upTo: 150000, rate: 0.008 },
  { upTo: 200000, rate: 0.006 },
  { upTo: 250000, rate: 0.004 },
  { upTo: 500000, rate: 0.003 },
  { upTo: Infinity, rate: 0.002 },
];
const ONLINE_SHARE = 0.6;
const MIN_ONLINE = 50;
const SMALL_UP_TO = 500;
const SMALL_RATE = 0.1;

export const roundTrip = makeRoundTrip({
  folder: "clientisoberaarg",
  brand: "Clientis Bank Oberaargau",
  catalogue: new URL("clientisoberaarg-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.35% a year (0.50% on foreign securities), min CHF 60, plus CHF 5 a position.",
  sources: {
    accounts: "https://bankoberaargau.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto",
    prices: "https://bankoberaargau.clientis.ch/documents/2043432/4745831/BOA_Preise_und_Gebuehren.pdf",
  },
  commission({ amountChf }) {
    if (amountChf <= SMALL_UP_TO) {
      const chf = amountChf * SMALL_RATE;
      return {
        chf,
        min: null,
        rate: SMALL_RATE,
        basis: `courtage e-Banking «bis CHF 500.- 10 %» : CHF ${Number(chf.toFixed(2))} par sens.`,
        confidence: "courtage e-Banking publiée (petit ordre jusqu'à CHF 500)",
      };
    }
    const full = sliced(SLICES, amountChf);
    const chf = Math.max(MIN_ONLINE, full * ONLINE_SHARE);
    return {
      chf,
      min: MIN_ONLINE,
      rate: chf / amountChf,
      basis:
        `courtage ordinaire par tranches (1,10 % jusqu'à CHF 50 000, puis 1,00 / 0,80 / 0,60 / 0,40 % par tranche de 50 000, 0,30 % jusqu'à 500 000, 0,20 % au-delà), ` +
        `e-Banking 60 % de la courtage ordinaire, minimum CHF 50 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage e-Banking publiée (60 % de l'ordinaire, minimum CHF 50 imprimé)",
    };
  },
});

cli(import.meta.url, roundTrip);
