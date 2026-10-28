// What acrevis Bank sells on the exchange, with no login. Its place is
// Switzerland and it prints no list of the titles it trades: the e-banking
// page says "Aktuelle Börsenkurse einsehen, Titel kaufen und verkaufen"
// and "Über das acrevis E-Banking können Sie auch Ihre Börsenaufträge
// aufgeben". The price list has a tariff for "Abschlüsse in Schweizer
// Franken: Aktien und ähnliche Papiere, Aktienfonds, strukturierte
// Produkte" (80 CHF minimum, 1.10 % up to 100,000) and one for
// "Abschlüsse in Fremdwährungen", and says "Immobilienfonds und Exchange
// Traded Funds (ETF) werden zum Aktientarif ... abgerechnet". So the book
// is the whole SIX Swiss Exchange book: shares, ETFs, ETNs/ETCs and listed
// funds, one row per line, in the line's trading currency (the USD, EUR
// and GBP lines on SIX fall under the foreign-currency tariff).
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.acrevis.ch/privat/konto-und-karte/rund-ums-e-banking
//   Fees: https://www.acrevis.ch/document/uebersicht-dienstleistungspreise
//
//   node brokers/acrevis/acrevis_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "acrevis",
  out: new URL("acrevis-parsed.json", import.meta.url),
});
