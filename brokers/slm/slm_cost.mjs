// What one round trip costs at Bank SLM (Spar + Leihkasse Münsingen): buy
// n shares or ETF units on SIX Swiss Exchange through SLM E-Banking or the
// app and sell them back, in dollars. The SIX book, the federal stamp, the
// SIX exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// "Preise und Dienstleistungen" (01.2026), page 14 "Courtage", read on
// 2026-10-26:
//   https://bankslm.ch/app/uploads/2018/01/Broschuere-Preise-Dienstleistungen.pdf
// "Aktien, kotierte Anlagefonds und ETF, strukturierte Produkte, Eurex
// Optionen, Warrants" (footnote 1 "Staffeltarif"), Inland: 0.90 % up to
// CHF 25,000, 0.70 % from 25,001 to 50,000, 0.50 % to 100,000, 0.30 % to
// 250,000, 0.20 % above; "Minimalgebühr 80.–". "Für Abschlüsse gelten nach
// dem Bruttowert je Abschluss gestaffelte Tarife. Fremdgebühren werden
// weiterverrechnet." "Aufträge via SLM E-Banking: 50% Rabatt". The
// Staffeltarif is read as cumulative slices (the brochure's mandate table
// calls its "kumulativ" fee a Staffeltarif too); the 50 % comes off the
// whole courtage, minimum included. So one side online is
//   50 % x max(CHF 80, sliced courtage).
// A SIX trade is an "Inland" trade whatever the line's currency or ISIN
// (the "Ausland" column, 1.30 %, minimum CHF 100, is for foreign
// exchanges).
//
// Accounts: the Universalkonto "ist auch in Euro verfügbar", and the
// counter tariff prices "Ein-/Auszahlungen via Fremdwährungskonto bis
// 10'000 EUR/USD", so CHF, EUR and USD are kept. No FX markup on account
// conversions is printed (the 1 % agio is for banknotes), so a GBP/JPY/...
// line, converted both ways, is N/A.
//
// Left out: depot fee 0.25 % a year, at least CHF 50 and CHF 10 a
// position (remark); the "Exklusiv" advisory model (35 % off, not
// cumulative with the e-banking discount, plus 0.25 % a year); mandates;
// VAT (not on courtage).
//
//   node brokers/slm/slm_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://bankslm.ch/app/uploads/2018/01/Broschuere-Preise-Dienstleistungen.pdf";
const BANDS = [
  { upTo: 25000, rate: 0.009 },
  { upTo: 50000, rate: 0.007 },
  { upTo: 100000, rate: 0.005 },
  { upTo: 250000, rate: 0.003 },
  { upTo: Infinity, rate: 0.002 },
];
const MIN = 80;
const DISCOUNT = 0.5;

export const roundTrip = makeRoundTrip({
  folder: "slm",
  brand: "Bank SLM",
  catalogue: new URL("slm-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 50 and CHF 10 a position.",
  sources: { accounts: "https://bankslm.ch/zahlen-sparen/einzelprodukte/konten-zahlen/universalkonto/" },
  commission({ amountChf }) {
    const full = sliced(BANDS, amountChf, MIN);
    const chf = full * DISCOUNT;
    return {
      chf,
      min: MIN * DISCOUNT,
      basis:
        `courtage «Aktien, kotierte Anlagefonds und ETF» Inland par tranches (0,90 % jusqu'à CHF 25 000, 0,70 % jusqu'à 50 000, 0,50 % jusqu'à 100 000, 0,30 % jusqu'à 250 000, 0,20 % au-delà, minimum CHF 80), ` +
        `rabais E-Banking 50 % : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage en ligne imprimée (rabais E-Banking 50 %, appliqué aussi au minimum) ; «Staffeltarif» lu par tranches cumulées ; une ligne SIX au tarif «Inland»",
    };
  },
});

cli(import.meta.url, roundTrip);
