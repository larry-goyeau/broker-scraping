// What one round trip costs at Bank EEK (Bern): buy n shares or ETF units
// on SIX Swiss Exchange through EEK E-Banking and sell them back, in
// dollars. The SIX book, the federal stamp, the SIX exchange fee, taxMap
// and the dollar answer come from ../migros/sixCost.mjs.
//
// "Anlageberatung – Courtage & Spesen" (01/2022, the sheet the site links
// today), read on 2026-10-26:
//   https://www.eek.ch/_Resources/Persistent/7/6/3/a/763ac5652e10a8fd46b4376b960e633941a2fde2/Bank_EEK_Courtage%26Spesen.pdf
// "Aktien, ETFs und ähnliche Papiere": minimum CHF 80; "bis zu
// CHF 50'000.00 1.10 %", "für die nächsten CHF 50'000.00 0.80 %", "für
// die nächsten CHF 100'000.00 0.60 %", "für die nächsten CHF 300'000.00
// 0.20 %", "über CHF 500'000.00 0.20 % auf dem Gesamtbetrag"; "zuzüglich
// fremde Spesen bei Fremdwährungstiteln CHF 50.00". "Kleinstabschlüsse
// bis zu CHF 800.00: 10 %, mind. CHF 25.00". No e-banking discount is
// printed: an order in E-Banking ("Handel von Wertschriften",
// https://www.eek.ch/e-banking) pays this tariff. So one side is
//   amount <= 800: max(CHF 25, 10 %);
//   up to 500,000: max(CHF 80, the slices); above: 0.20 % of the whole;
// plus CHF 50 when the line trades in a currency other than CHF (a
// "Fremdwährungstitel"; the sheet prints the flat sum without asking
// where the trade is done).
//
// Accounts: "Eurokonto" and "Fremdwährungskonto", both "als Ergänzung zum
// Wertschriftendepot"; the foreign-currency account's currencies are not
// named, so only CHF and EUR are kept
// (https://www.eek.ch/de/services/konten/eurokonto,
// https://www.eek.ch/de/services/konten/fremdwaehrungskonto). Conversions
// are "zum Devisenkurs" with no markup printed
// (https://www.eek.ch/de/services/zahlungsverkehr/devisen), so a
// USD/GBP/JPY/... line, converted both ways, is N/A.
//
// Left out: the yearly fee of the transactional advisory model, the depot
// every client holds: 0.25 %, +0.10 % on foreign-currency titles, at least
// CHF 100, CHF 5 a position (remark;
// https://www.eek.ch/_Resources/Persistent/b/e/f/d/befd6d6ba3970b00c04ab80e7be13f3db4e96c9b/Bank_EEK_transaktionsbezogene_Anlageberatung.pdf);
// "interessewahrende Aufträge" (care orders, +0.10 % / 0.05 %); the ETF
// savings plan (1 %); VAT (not on courtage).
//
//   node brokers/eek/eek_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE =
  "https://www.eek.ch/_Resources/Persistent/7/6/3/a/763ac5652e10a8fd46b4376b960e633941a2fde2/Bank_EEK_Courtage%26Spesen.pdf";
const BANDS = [
  { upTo: 50000, rate: 0.011 },
  { upTo: 100000, rate: 0.008 },
  { upTo: 200000, rate: 0.006 },
  { upTo: 500000, rate: 0.002 },
];
const WHOLE_ABOVE = 500000;
const WHOLE_RATE = 0.002;
const MIN = 80;
const SMALL_UP_TO = 800;
const SMALL_RATE = 0.1;
const SMALL_MIN = 25;
const FOREIGN_CHARGES = 50;

export const roundTrip = makeRoundTrip({
  folder: "eek",
  brand: "Bank EEK",
  catalogue: new URL("eek-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year (0.35% on foreign-currency titles), at least CHF 100, plus CHF 5 a position.",
  sources: {
    accounts: "https://www.eek.ch/de/services/konten/eurokonto",
    custody: "https://www.eek.ch/_Resources/Persistent/b/e/f/d/befd6d6ba3970b00c04ab80e7be13f3db4e96c9b/Bank_EEK_transaktionsbezogene_Anlageberatung.pdf",
  },
  commission({ amountChf, listing }) {
    let courtage;
    let what;
    if (amountChf <= SMALL_UP_TO) {
      courtage = Math.max(SMALL_MIN, amountChf * SMALL_RATE);
      what = "«Kleinstabschlüsse» jusqu'à CHF 800 : 10 %, minimum CHF 25";
    } else if (amountChf > WHOLE_ABOVE) {
      courtage = amountChf * WHOLE_RATE;
      what = "0,20 % sur tout le montant au-delà de CHF 500 000";
    } else {
      courtage = sliced(BANDS, amountChf, MIN);
      what = "par tranches (1,10 % jusqu'à CHF 50 000, 0,80 % sur les 50 000 suivants, 0,60 % sur les 100 000 suivants, 0,20 % jusqu'à 500 000), minimum CHF 80";
    }
    const foreign = listing.currency !== "CHF" ? FOREIGN_CHARGES : 0;
    const chf = courtage + foreign;
    return {
      chf,
      min: amountChf <= SMALL_UP_TO ? SMALL_MIN : MIN,
      basis:
        `courtage «Aktien, ETFs und ähnliche Papiere» ${what}` +
        (foreign ? `, plus CHF 50 de «fremde Spesen bei Fremdwährungstiteln» (ligne en ${listing.currency})` : "") +
        ` : CHF ${Number(chf.toFixed(2))} par sens ; aucun rabais E-Banking imprimé.`,
      confidence:
        "tarif imprimé, sans rabais en ligne" +
        (foreign ? " ; CHF 50 de frais étrangers comptés sur une ligne en devise même à la SIX (le tarif ne distingue pas la place)" : ""),
    };
  },
});

cli(import.meta.url, roundTrip);
