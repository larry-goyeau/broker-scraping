// What one round trip costs at Nidwaldner Kantonalbank (NKB): buy n shares
// or ETF units on SIX Swiss Exchange online (DEPOT Direkt, E-Banking) and
// sell them straight back, in dollars. The SIX book, the federal stamp,
// taxMap and the conversion are ../migros/sixCost.mjs (through
// ../graubundnerkanto/sixPlaceCost.mjs); this file gives the ticket fee,
// the bank's own exchange-fee line and the account currencies.
//
// "Preise im Anlagegeschäft" (06.2026), read on 2026-10-26:
//   https://nkb.ch/sites/default/files/media/document/Anlagegeschaeft_Preise_15_06_2026_2.pdf
//   p. 2 "Ticket-Fee (Pauschalgebühr pro Transaktion)": "offline bis CHF
//   25'000 CHF 100", "ab CHF 25'001 und bis CHF 50'000 CHF 150", "ab CHF
//   50'001 CHF 200", "online 30 % Rabatt" (so CHF 70 / 105 / 140).
//   "Meldegebühr CHF 1.60 pro Abschluss".
//   "Börsengebühr SIX Swiss Exchange": "übrige Aktien CHF 0.50 + 0,0038 %
//   (Minimum CHF 0.25 / Maximum CHF 38)"; "ETF's und Anlagefonds CHF 1.50
//   + 0,0150 % (Minimum CHF 0.50 / Maximum CHF 150)". The "Swiss Blue Chip
//   Segment" line (CHF 0.25 + 0,0037 %) is lower; the catalogue does not
//   say which share is a Blue Chip, so every share takes "übrige Aktien".
//   This printed line replaces the SIX list (and its promotions).
//   "Eidgenössische Umsatzabgabe Schweizerische Wertpapiere 0,075 %,
//   Ausländische Wertpapiere 0,150 %" (the engine's stamp). "Fonds mit
//   Domizil Schweiz befreit" is read as issue and redemption: a Swiss ETF
//   bought on SIX keeps the 0.075 %.
// So each side: the online ticket fee of the band, plus the printed
// exchange fee, plus the CHF 1.60 Meldegebühr.
//   https://www.nkb.ch/depotdirekt  ("Sie geben Börsenaufträge
//   selbstständig in Auftrag")
// Custody, DEPOT Direkt: "0,25 %" to CHF 2 million, "Minimum CHF 50" a
// year (p. 6): a remark.
//
// Accounts: "Privatkonto Fremdwährung" in "EUR, USD, GBP, SEK, NOK, DKK,
// HKD, JPY, CAD, AUD, NZD und ZAR":
//   https://www.nkb.ch/privatkonto-fremdwaehrung?parent=2324
// CHF, EUR, USD, GBP, JPY, AUD and CAD lines stay unconverted; an SGD line
// converts at a rate NKB does not print (only a cash agio), so it is N/A.
//
// Left out: the offline ticket fee, bonds, rights, structured products,
// Eurex, the custody fee in the total and the CHF 25 a month for
// deliveries of clients domiciled abroad.
//
//   node brokers/nidwaldnerkanton/nidwaldnerkanton_cost.mjs NESN XSWX CHF --shares=11 --price=77.46
//   node brokers/nidwaldnerkanton/nidwaldnerkanton_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/nidwaldnerkanton/nidwaldnerkanton_cost.mjs NESN XSWX CHF --shares=400 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { bandFlat, cli, makeRoundTrip, printedFee } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://nkb.ch/sites/default/files/media/document/Anlagegeschaeft_Preise_15_06_2026_2.pdf";
const DEPOT = "https://www.nkb.ch/depotdirekt";
const ACCOUNTS = "https://www.nkb.ch/privatkonto-fremdwaehrung?parent=2324";
const ONLINE = 0.7;
const TICKETS = [
  { upTo: 25000, chf: 100 },
  { upTo: 50000, chf: 150 },
  { upTo: Infinity, chf: 200 },
].map((b) => ({ upTo: b.upTo, chf: b.chf * ONLINE }));

export const roundTrip = makeRoundTrip({
  folder: "nidwaldnerkanton",
  brand: "Nidwaldner Kantonalbank",
  catalogue: new URL("nidwaldnerkanton-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.25% a year, min CHF 50.",
  sources: { depotDirekt: DEPOT, accounts: ACCOUNTS },
  exchangeFee: printedFee({
    groups: {
      shares: { fix: 0.5, pct: 0.000038, min: 0.25, max: 38 },
      etp: { fix: 1.5, pct: 0.00015, min: 0.5, max: 150 },
    },
    perOrder: 1.6,
    perOrderLabel: "Meldegebühr",
    label: "Börsengebühr du tarif NKB",
  }),
  commission({ amountChf }) {
    const chf = bandFlat(TICKETS, amountChf);
    return {
      chf: Number(chf.toFixed(2)),
      min: TICKETS[0].chf,
      basis:
        `Ticket-Fee CHF 100 jusqu'à CHF 25 000, CHF 150 jusqu'à CHF 50 000, CHF 200 au-delà, moins 30 % en ligne : ici CHF ${Number(chf.toFixed(2))} par sens.`,
      confidence: "rabais en ligne de 30 % imprimé",
    };
  },
});

cli(import.meta.url, roundTrip);
