// What one round trip costs at Graubündner Kantonalbank (GKB): buy n shares
// or ETF units on SIX Swiss Exchange through e-Banking and sell them
// straight back, in dollars. The SIX book, the federal stamp, the SIX fee,
// taxMap and the conversion are ../migros/sixCost.mjs (through
// ./sixPlaceCost.mjs); this file gives the courtage and the account
// currencies.
//
// Price list "Preise im Überblick", "Gültig ab 07. 2026", p. 24
// "Wertschriftenhandel", read on 2026-10-26:
//   https://www.gkb.ch/content/dam/gkb/dokumente/private/Preise-Ueberblick-DE.pdf
//   "Courtage", "Kurswert in CHF", column "Aktien Schweiz / Strukturierte
//   Produkte":
//     "Mindestgebühr CHF 80.–", "Unter 50'000.– 0.95 %", "Ab 50'000.–
//     0.80 %", "Ab 100'000.– 0.60 %", "Ab 250'000.– 0.35 %"
//   "Die Sätze gelten für Beteiligungspapiere ... sowie für
//   börsengehandelte Fonds. Umsatzabgaben, Börsengebühren und allfällige
//   fremde Kommissionen werden zusätzlich verrechnet" (the stamp and the
//   official SIX fee, in the engine: GKB prints no exchange-fee amount).
//   "Aufträge via e-Banking geniessen eine Reduktion von 50 % auf
//   ordentliche Tarife."
// So each side, online: max(CHF 40, half the band rate x the whole
// amount). The 50 % is read on the whole tariff, minimum included (CHF 80
// -> 40); the band rate applies to the whole amount (no "Staffel" wording).
// The "Aktien Schweiz" column is read as the trading place (an order on
// SIX), for a foreign share or ETF on SIX too; the "Aktien Ausland" column
// (1.50 %, CHF 100 minimum) is read as orders on foreign exchanges.
// Custody, "GKB Anlage-Direkt" (execution only, "Die GKB übernimmt
// ausschliesslich die Depotführung"), p. 20: "Jahresgebühr Pro Depot 0.20 %",
// "Mindestgebühr Pro Depot CHF 100.–" (plus 0.10 % for foreign-currency
// positions): a remark, not in the total.
//   https://www.gkb.ch/de/private/unsere-angebote/anlegen-und-sparen/anlage-direkt
//
// Accounts: Privatkonto Euro, Kontokorrent Euro, Sparkonto Euro and a
// "Fremdwährungskonto" ("CHF 6.– pro Quartal", p. 5), which GKB says is
// "in zahlreichen Währungen verfügbar":
//   https://www.gkb.ch/de/private/unsere-angebote/konten-und-karten/fremdwaehrungskonto
// Every currency of the SIX book (CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD)
// is taken as holdable, so nothing is converted. GKB prints no conversion
// margin for securities, so no FX remark.
//
// Left out: the "Aktien Ausland" and bond columns, the 10 % small-order
// minimum (rights only: "Bei Anrechten"), options and futures, custody in the total,
// the account fees and the "Auslandkundengebühr" (CHF 240 a year for
// clients domiciled abroad below CHF 100,000): not per trade.
//
//   node brokers/graubundnerkanto/graubundnerkanto_cost.mjs NESN XSWX CHF --shares=11 --price=77.46
//   node brokers/graubundnerkanto/graubundnerkanto_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/graubundnerkanto/graubundnerkanto_cost.mjs VWRL XSWX CHF --shares=5 --price=151
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "./sixPlaceCost.mjs";

const PAGE = "https://www.gkb.ch/content/dam/gkb/dokumente/private/Preise-Ueberblick-DE.pdf";
const ACCOUNTS = "https://www.gkb.ch/de/private/unsere-angebote/konten-und-karten/fremdwaehrungskonto";
const DEPOT = "https://www.gkb.ch/de/private/unsere-angebote/anlegen-und-sparen/anlage-direkt";
const ONLINE = 0.5;
const MIN_CHF = 80 * ONLINE;
const BANDS = [
  { upTo: 49999.99, rate: 0.0095 },
  { upTo: 99999.99, rate: 0.008 },
  { upTo: 249999.99, rate: 0.006 },
  { upTo: Infinity, rate: 0.0035 },
].map((b) => ({ upTo: b.upTo, rate: b.rate * ONLINE }));

export const roundTrip = makeRoundTrip({
  folder: "graubundnerkanto",
  brand: "Graubündner Kantonalbank",
  catalogue: new URL("graubundnerkanto-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SGD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.2% a year, min CHF 100.",
  sources: { accounts: ACCOUNTS, anlageDirekt: DEPOT },
  commission({ amountChf }) {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    return {
      chf: bandRate(BANDS, amountChf, MIN_CHF),
      rate: band.rate,
      min: MIN_CHF,
      basis:
        `colonne «Aktien Schweiz», taux de la tranche sur tout le montant (0,95 % sous CHF 50 000, 0,80 %, 0,60 %, 0,35 % dès CHF 250 000), ` +
        `minimum CHF 80, moins 50 % via e-Banking : ici ${pctFr(band.rate)} %, minimum CHF ${MIN_CHF}.`,
      confidence:
        "rabais e-Banking de 50 % imprimé, lu aussi sur le minimum ; «Aktien Schweiz» lu comme la place (SIX), titre étranger compris",
    };
  },
});

cli(import.meta.url, roundTrip);
