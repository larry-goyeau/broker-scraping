// What one round trip costs at GRB Glarner Regionalbank: buy n shares or
// ETF units on SIX Swiss Exchange through E-Banking / MobileBanking and
// sell them back, in dollars. The SIX book, the federal stamp, the SIX
// exchange fee, taxMap and the dollar answer come from ../migros/sixCost.mjs.
//
// "Dienstleistungen und Preise, gültig ab 1. Januar 2026", read on
// 2026-10-26:
//   https://grb.ch/fileadmin/user_upload/Diverses/01_PDFs/GRB_Dienstleistungen_und_Preise_2026.pdf
// Courtagen, "Kumulierte Berechnung auf Bruttobetrag", "Abschlüsse in der
// Schweiz: Aktien, strukturierte Produkte, ETFs und ähnliche Wertpapiere":
// minimum CHF 80 per order; 1.00 % up to CHF 50,000, 0.70 % on the next
// 50,000, 0.40 % on the next 100,000, 0.20 % from 200,000. "Die
// aufgeführten Preise sind Pauschalpreise und umfassen eigene & fremde
// Courtagen. Gebühren und Abgaben Dritter (z.B. eidgenössischer Stempel,
// Börsenabgaben) werden zusätzlich belastet." A SIX trade is a Swiss trade
// whatever the line's currency.
// "Selbständige Transaktionsabwicklung über E-Banking / MobileBanking:
// Transaktionsrabatt 50 %, Minimum CHF 40.00." So one side online is
//   max(CHF 40, 50 % x cumulative courtage).
// The "Kleinabschlüsse bis 3'000.00: 50.00" line would only matter offline
// (50 % of it is below the CHF 40 online minimum).
//
// Accounts: "Privatkonto ... In den Währungen CHF / EUR erhältlich" and
// "Eurokonto Privat" (https://www.grb.ch/unsere-produkte/zahlen/zahlungskonten);
// the "Kontokorrent FW" is the business current account. FX: "Kauf /
// Verkauf Fremdwährungen zu aktuellen Kursen", no markup printed, so a
// USD/GBP/JPY/... line (converted both ways) is N/A.
//
// Left out: depot fee 0.25 % a year, at least CHF 50 (remark); the
// advisory and mandate tariffs (not online prices); VAT (not on courtage).
//
//   node brokers/glarnerregionalb/glarnerregionalb_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://grb.ch/fileadmin/user_upload/Diverses/01_PDFs/GRB_Dienstleistungen_und_Preise_2026.pdf";
const BANDS = [
  { upTo: 50000, rate: 0.01 },
  { upTo: 100000, rate: 0.007 },
  { upTo: 200000, rate: 0.004 },
  { upTo: Infinity, rate: 0.002 },
];
const DISCOUNT = 0.5;
const MIN_ONLINE = 40;

export const roundTrip = makeRoundTrip({
  folder: "glarnerregionalb",
  brand: "GRB Glarner Regionalbank",
  catalogue: new URL("glarnerregionalb-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 50.",
  sources: { accounts: "https://www.grb.ch/unsere-produkte/zahlen/zahlungskonten" },
  commission({ amountChf }) {
    const full = sliced(BANDS, amountChf);
    const chf = Math.max(MIN_ONLINE, full * DISCOUNT);
    return {
      chf,
      min: MIN_ONLINE,
      basis:
        `courtage «Abschlüsse in der Schweiz» cumulée (1 % jusqu'à CHF 50 000, 0,70 % sur les 50 000 suivants, 0,40 % sur les 100 000 suivants, 0,20 % au-delà de 200 000), ` +
        `rabais E-Banking 50 %, minimum CHF 40 : CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "courtage en ligne imprimée (rabais de transaction 50 %, minimum CHF 40)",
    };
  },
});

cli(import.meta.url, roundTrip);
