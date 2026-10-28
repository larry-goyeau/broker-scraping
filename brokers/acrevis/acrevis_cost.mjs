// What one round trip costs at acrevis Bank: buy n shares or ETF units on
// SIX Swiss Exchange through E-Banking ("acrevis invest basis") and sell
// them back, in dollars. The SIX book, the federal stamp, the SIX exchange
// fee, taxMap and the dollar answer come from ../migros/sixCost.mjs.
//
// "Übersicht Dienstleistungspreise, Gültig ab 1. Oktober 2026", read on
// 2026-10-26:
//   https://www.acrevis.ch/document/uebersicht-dienstleistungspreise
// 19.1.1 "Abschlüsse in Schweizer Franken: Aktien und ähnliche Papiere,
// Aktienfonds, strukturierte Produkte", "Kurswert pro Transaktion": bis CHF
// 100'000 1.10 %, ab 100'000 bis 250'000 0.75 %, ab 250'000 bis 500'000
// 0.50 %, ab 500'000 0.40 %, minimum CHF 80.
// 19.2.1 "Abschlüsse in Fremdwährungen: Aktien und ähnliche Papiere": 1.70 %,
// 1.15 %, 0.75 %, 0.60 % on the same bands, minimum CHF 100.
// 19.3.3 "Immobilienfonds und Exchange Traded Funds (ETF) werden zum
// Aktientarif (19.1.1 bzw. 19.2.1) abgerechnet." ETNs/ETCs are structured
// products, also on the share tariff. "Gebühren und Abgaben (z. B.
// eidgenössischer Stempel, Börsenabgaben) werden zusätzlich belastet."
// The band's rate is taken on the whole amount ("Kurswert pro Transaktion").
// 20.1 "acrevis invest basis: Selbständige Transaktionsabwicklung über
// E-Banking. Depotgebühr 0.30 %, Transaktionsrabatt 60 %, Minimum Inland
// CHF 40.00, Minimum Ausland CHF 60.00." So one side online is
//   CHF line:            max(CHF 40, 40 % x 19.1.1 rate x amount)
//   USD/EUR/GBP... line: max(CHF 60, 40 % x 19.2.1 rate x amount)
// A foreign-currency line on SIX is an "Abschluss in Fremdwährung" (19.2);
// whether its minimum is the Inland or the Ausland one is not said, so the
// higher (CHF 60, the one that goes with the foreign-currency tariff) is used.
//
// Accounts: "Privatkonto CHF/EUR", "Kontokorrent Privat: Währung alle"
// (same price list, section 1), so every SIX trading currency is held and
// nothing is converted. No FX markup is printed for conversions.
//
// Left out: depot fee 0.30 % a year (+0.10 % on foreign-domiciled values),
// at least CHF 100 (remark); advisory tariffs (not online prices); VAT
// (not on courtage).
//
//   node brokers/acrevis/acrevis_cost.mjs NESN XSWX CHF --shares=10 --price=80
//   node brokers/acrevis/acrevis_cost.mjs CSSPX XSWX USD --shares=2 --price=650
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip } from "../migros/sixCost.mjs";

const PAGE = "https://www.acrevis.ch/document/uebersicht-dienstleistungspreise";
const CHF_BANDS = [
  { upTo: 100000, rate: 0.011 },
  { upTo: 250000, rate: 0.0075 },
  { upTo: 500000, rate: 0.005 },
  { upTo: Infinity, rate: 0.004 },
];
const FOREIGN_BANDS = [
  { upTo: 100000, rate: 0.017 },
  { upTo: 250000, rate: 0.0115 },
  { upTo: 500000, rate: 0.0075 },
  { upTo: Infinity, rate: 0.006 },
];
const PAY = 0.4; // 60 % Transaktionsrabatt
const MIN_INLAND = 40;
const MIN_AUSLAND = 60;

export const roundTrip = makeRoundTrip({
  folder: "acrevis",
  brand: "acrevis Bank",
  catalogue: new URL("acrevis-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.30% a year, at least CHF 100.",
  commission({ amountChf, listing }) {
    const chfLine = listing.currency === "CHF";
    const bands = chfLine ? CHF_BANDS : FOREIGN_BANDS;
    const min = chfLine ? MIN_INLAND : MIN_AUSLAND;
    const full = bandRate(bands, amountChf);
    const chf = Math.max(min, full * PAY);
    return {
      chf,
      min,
      rate: bands.find((b) => amountChf <= b.upTo).rate * PAY,
      basis: chfLine
        ? `«acrevis invest basis» : tarif 19.1.1 en francs (1,10 % jusqu'à CHF 100 000, 0,75 % jusqu'à 250 000, 0,50 % jusqu'à 500 000, 0,40 % au-delà, sur tout le montant), rabais 60 %, minimum CHF 40 : CHF ${Number(chf.toFixed(2))} par sens.`
        : `«acrevis invest basis» : tarif 19.2.1 «Abschlüsse in Fremdwährungen» (1,70 % jusqu'à CHF 100 000, 1,15 % jusqu'à 250 000, 0,75 % jusqu'à 500 000, 0,60 % au-delà, sur tout le montant), rabais 60 %, minimum «Ausland» CHF 60 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: chfLine
        ? "courtage en ligne imprimée (invest basis, rabais 60 %, minimum CHF 40)"
        : "ligne en devise sur SIX : tarif en devises et minimum «Ausland» CHF 60 retenus (le plus élevé, le tarif ne dit pas lequel)",
    };
  },
});

cli(import.meta.url, roundTrip);
