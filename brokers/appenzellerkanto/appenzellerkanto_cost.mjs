// What one round trip costs at Appenzeller Kantonalbank (APPKB): buy n
// shares or ETF units on SIX Swiss Exchange through E-Banking and sell them
// straight back, in dollars. The SIX book, the federal stamp, the SIX fee,
// taxMap and the conversion are ../migros/sixCost.mjs; this file gives the
// courtage and the account currencies.
//
// "Konditionen Courtagen", read on 2026-10-26:
//   https://www.appkb.ch/private/anlegen/konditionen-courtagen
//   "Aktien Schweiz, Aktien ETF's Schweiz und Strukturierte Produkte: bis
//   CHF 100'000 0.90 %, bis CHF 250'000 0.70 %, ab CHF 250'000 0.60 %,
//   Minimum pro Ticket CHF 80"
//   "Obligationen und Obligationen ETF's Schweiz: bis CHF 100'000 0.80 %,
//   bis CHF 250'000 0.60 %, ab CHF 250'000 0.40 %, Minimum pro Ticket
//   CHF 80"
//   "Für E-Banking-Transaktionen wird 50 % Rabatt auf die ordentlichen
//   Tarife gewährt."
//   "Nicht inbegriffen sind Steuern (Umsatz- oder Stempelabgabe),
//   Börsengebühren und Fremdkosten" (the stamp and the SIX fee, in the
//   engine).
// "Schweiz" is read as the trading place: every SIX line, a foreign share
// or an Irish ETF included, takes the Swiss rows, not "Aktien Ausland"
// (1.00 %). A SIX "Fixed Income" ETF takes the bond-ETF row; every other
// line (shares, ETFs, ETN/ETC as structured products) the share row. The
// band rate applies to the whole order. The 50 % is "auf die ordentlichen
// Tarife", whose rows include "Minimum pro Ticket CHF 80": each side is
// max(CHF 40, half the band rate x amount).
// Custody, execution only: "Depotgebühr 0.35 %", "Minimum CHF 50 / Jahr"
// (https://www.appkb.ch/private/anlegen/konditionen-anlageloesungen): a
// remark.
//
// Accounts: CHF accounts and the "Privatkonto EUR", "das ideale Konto zur
// bequemen und schnellen Abwicklung Ihrer Zahlungen und
// Wertschriftengeschäfte in Euro"; no other currency account is offered
// to private clients. CHF and EUR lines stay unconverted.
//   https://www.appkb.ch/private/zahlen/konten-zum-zahlen
// FX: APPKB prints no conversion margin; its "Kurse" page links to
// yourmoney.ch interbank spot rates ("indikativ"). A USD, GBP, JPY, AUD,
// CAD or SGD line would convert both ways at an unpublished rate: N/A.
//   https://www.appkb.ch/private/anlegen/kurse
//
// Left out: the adviser channel (no discount), foreign exchanges, funds,
// Eurex options, the custody fee and "Kunden mit Domizil Ausland pro
// Monat 20.–": not per trade.
//
//   node brokers/appenzellerkanto/appenzellerkanto_cost.mjs NESN XSWX CHF --shares=13 --price=77.46
//   node brokers/appenzellerkanto/appenzellerkanto_cost.mjs 29GA XSWX EUR --shares=190 --price=5.283
//   node brokers/appenzellerkanto/appenzellerkanto_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://www.appkb.ch/private/anlegen/konditionen-courtagen";
const ONLINE = 0.5;
const MIN_CHF = 80 * ONLINE;
const SHARES = [
  { upTo: 100000, rate: 0.009 },
  { upTo: 250000, rate: 0.007 },
  { upTo: Infinity, rate: 0.006 },
];
const BOND_ETF = [
  { upTo: 100000, rate: 0.008 },
  { upTo: 250000, rate: 0.006 },
  { upTo: Infinity, rate: 0.004 },
];
const isBondEtf = (row) => String(row?.type || "").toUpperCase() === "ETF" && /\|\s*Fixed Income\s*(\||$)/i.test(String(row?.raw || ""));

export const roundTrip = makeRoundTrip({
  folder: "appenzellerkanto",
  brand: "Appenzeller Kantonalbank",
  catalogue: new URL("appenzellerkanto-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.35% a year, min CHF 50.",
  sources: {
    custody: "https://www.appkb.ch/private/anlegen/konditionen-anlageloesungen",
    accounts: "https://www.appkb.ch/private/zahlen/konten-zum-zahlen",
  },
  commission({ amountChf, row }) {
    const bond = isBondEtf(row);
    const band = (bond ? BOND_ETF : SHARES).find((b) => amountChf <= b.upTo);
    const rate = band.rate * ONLINE;
    return {
      chf: bandRate([{ upTo: Infinity, rate }], amountChf, MIN_CHF),
      rate,
      min: MIN_CHF,
      basis:
        `${bond ? "«Obligationen ETF's Schweiz»" : "«Aktien Schweiz, Aktien ETF's Schweiz und Strukturierte Produkte»"} ` +
        `${pctFr(band.rate)} % pour ce montant, rabais E-Banking de 50 % → ${pctFr(rate)} %, minimum CHF 80 par ticket réduit de moitié → CHF ${MIN_CHF}.`,
      confidence: "rabais E-Banking de 50 % sur «die ordentlichen Tarife», minimum par ticket compris (CHF 40) ; «Schweiz» lu comme la place de cotation",
    };
  },
});

cli(import.meta.url, roundTrip);
