// What one round trip costs at Spar- und Leihkasse Bucheggberg (SLB): buy
// n shares or ETF units on SIX Swiss Exchange through SLB e-Banking and
// sell them back, in dollars. The SIX book, the federal stamp, the SIX
// exchange fee, taxMap and the dollar answer come from
// ../migros/sixCost.mjs.
//
// "Anlagen – Dienstleistungen / Courtage (gültig ab 3. März 2026)", read
// on 2026-10-26:
//   https://www.slb.ch/app/uploads/2026/03/Gebuehren-Tarife-Bereich-Anlagen-aktuell.pdf
// (the same tables are in the full "Gebühren und Tarife" factsheet,
// https://www.slb.ch/app/uploads/2026/07/Factsheet_SLB_Gebuehren-Tarife_aktuell.pdf).
// Slices ("bis zu ... für die nächsten ... über CHF 500 000.00"):
//   "Aktien Schweizer Franken", minimum CHF 80: 1.10 % to 25,000, 1.00 %
//   next 25,000, 0.90 % next 50,000, 0.80 % / 0.70 % / 0.50 % on the next
//   three 50,000, 0.40 % next 250,000, 0.20 % above 500,000.
//   "Aktien Fremdwährung", minimum CHF 120: 1.70 %, 1.60 %, 1.50 %, 1.40 %,
//   1.30 %, 1.10 %, 0.90 %, 0.80 % on the same slices.
//   "Anrechte / Optionen / Kleinstabschlüsse": "bis zu CHF 800.00 10,00 %",
//   minimum CHF 10; "für die nächsten CHF 6 473.00 CHF 80.00"; above
//   7,273 "gemäss Aktientarif". Its steps are the franc share tariff's
//   (1.10 % x 7,273 = 80), so it is applied to CHF lines only.
//   "Strukturierte Produkte / ETF-Fonds / Immobilienfonds: Courtagen gemäss
//   Aktientarif".
//   "20 % Rabatt für Börsentransaktionen via SLB e-Banking".
// So one side online is 80 % x the tariff of the line's trading currency.
// "Dieser Tarif enthält nur eigene Courtagen. Allfällige fremde Courtagen
// und Spesen ... werden separat belastet."
//
// Accounts: Privatkonto, Kontokorrent and a "Fremdwährungskonto" whose
// currencies are not named (factsheet page 1), so only CHF is kept. No FX
// markup is printed, so a USD/EUR/GBP/... line, converted both ways, is N/A.
//
// Left out: Execution Only depot fee 0.25 % a year, at least CHF 40, plus
// CHF 7.50 a position (remark); the advisory depot (0.30 %); mandates; VAT
// (not on courtage).
//
//   node brokers/sparundleihkassech/sparundleihkassech_cost.mjs NESN XSWX CHF --shares=10 --price=80
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced } from "../migros/sixCost.mjs";

const PAGE = "https://www.slb.ch/app/uploads/2026/03/Gebuehren-Tarife-Bereich-Anlagen-aktuell.pdf";
const STEPS = [25000, 50000, 100000, 150000, 200000, 250000, 500000, Infinity];
const CHF_RATES = [0.011, 0.01, 0.009, 0.008, 0.007, 0.005, 0.004, 0.002];
const FOREIGN_RATES = [0.017, 0.016, 0.015, 0.014, 0.013, 0.011, 0.009, 0.008];
const bands = (rates) => STEPS.map((upTo, i) => ({ upTo, rate: rates[i] }));
const CHF_BANDS = bands(CHF_RATES);
const FOREIGN_BANDS = bands(FOREIGN_RATES);
const MIN_CHF = 80;
const MIN_FOREIGN = 120;
const SMALL_UP_TO = 800;
const SMALL_RATE = 0.1;
const SMALL_MIN = 10;
const ONLINE = 0.8;
const fr = (x) => Number(x.toFixed(2));

export const roundTrip = makeRoundTrip({
  folder: "sparundleihkassech",
  brand: "Spar- und Leihkasse Bucheggberg",
  catalogue: new URL("sparundleihkassech-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, at least CHF 40, plus CHF 7.50 a position.",
  sources: { factsheet: "https://www.slb.ch/app/uploads/2026/07/Factsheet_SLB_Gebuehren-Tarife_aktuell.pdf" },
  commission({ amountChf, listing }) {
    const franc = listing.currency === "CHF";
    let full;
    let what;
    if (franc && amountChf <= SMALL_UP_TO) {
      full = Math.max(SMALL_MIN, amountChf * SMALL_RATE);
      what = "«Kleinstabschlüsse» jusqu'à CHF 800 : 10 %, minimum CHF 10";
    } else if (franc) {
      full = sliced(CHF_BANDS, amountChf, MIN_CHF);
      what = "«Aktien Schweizer Franken» par tranches (1,10 % jusqu'à CHF 25 000, puis 1,00 / 0,90 / 0,80 / 0,70 / 0,50 / 0,40 %, 0,20 % au-delà de 500 000), minimum CHF 80";
    } else {
      full = sliced(FOREIGN_BANDS, amountChf, MIN_FOREIGN);
      what = `«Aktien Fremdwährung» (ligne en ${listing.currency}) par tranches (1,70 % jusqu'à CHF 25 000, puis 1,60 / 1,50 / 1,40 / 1,30 / 1,10 / 0,90 %, 0,80 % au-delà de 500 000), minimum CHF 120`;
    }
    const chf = full * ONLINE;
    return {
      chf,
      min: (franc ? (amountChf <= SMALL_UP_TO ? SMALL_MIN : MIN_CHF) : MIN_FOREIGN) * ONLINE,
      basis: `courtage ${what}, rabais e-Banking 20 % : CHF ${fr(chf)} par sens.`,
      confidence: "courtage en ligne imprimée (rabais e-Banking 20 %, appliqué aussi au minimum) ; tarif choisi par la devise de la ligne ; ETF et ETP «gemäss Aktientarif»",
    };
  },
});

cli(import.meta.url, roundTrip);
