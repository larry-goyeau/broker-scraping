// What Sparkasse Schwyz sells on the exchange, with no login. Its place is
// Switzerland and it prints no list of the titles it trades. The Execution
// Only page ("Depot ohne Beratung") promises "Zugang zum gesamten
// Anlageuniversum und zu den wichtigsten Börsenplätzen", orders by
// "E-Banking/Mobile Banking, Telefon oder E-Mail"; the shares and equity
// funds product sheet says orders can be entered "direkt in Ihrem
// e-Banking" and names "Börsenhandel (bei Direktanlagen und ETF's)". The
// price list has "Courtage Kategorie 1 (Obligationen, Aktien CHF, Fonds
// Domizil Schweiz, sonstige Anlagen CHF)" and "Kategorie 2 (Aktien
// Fremdwährung, Fonds Domizil Ausland, sonstige Anlagen Fremdwährung)",
// with "Börsentransaktionen via E-Banking / Mobile Banking ... 50%
// Reduktion, Minimum CHF 29.00". So the book is the whole SIX Swiss
// Exchange book: shares, ETFs, ETNs/ETCs and listed funds, one row per
// line, in the line's trading currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.sparkasse.ch/de/private/anlegen/depot_ohne_beratung/depot_ohne_beratung_direktlink
//   https://www.sparkasse.ch/pdf/publikationen/broschueren/anlegen/produkteblaetter/sparkasse-schwyz-ag-produkteblatt-aktien-aktienfonds.pdf
//   Fees: https://www.sparkasse.ch/pdf/publikationen/broschueren/konten-sparen/dienstleistung_preise.pdf
//
//   node brokers/sparkasseschwyz/sparkasseschwyz_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Sparkasse Schwyz",
  out: new URL("sparkasseschwyz-parsed.json", import.meta.url),
});
