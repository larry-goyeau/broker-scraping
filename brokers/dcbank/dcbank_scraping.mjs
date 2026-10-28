// What DC Bank (Deposito-Cassa der Stadt Bern) sells on the exchange, with
// no login. Its place is the SIX Swiss Exchange and it prints no list of the
// titles it trades: its «Execution Only» factsheet says "Keine Einschränkung
// des Anlageuniversums" and "Zugang zu den wichtigsten Börsenplätzen" (the
// footnote only asks that the title be "im Valorenstamm der DC Bank
// enthalten"). The "Leistungen und Gebühren" brochure (1 January 2025, still
// the one the conditions sheet points to) has an "Effektenhandel" courtage
// for "Aktien, Obligationen, Anlagefonds, Exchange Traded Funds ..." with
// "Börsenplatz / Abschluss in der Schweiz" at 1.00 % up to 500,000, 100 CHF
// minimum, and "50 % für Effektenhandel über e-Banking". So the book is the
// whole SIX Swiss Exchange book: shares, ETFs, ETNs/ETCs and listed funds,
// one row per line, in the line's trading currency.
//
// No DC Bank page names a segment, board or product it does not trade on
// SIX, so nothing is removed beyond what brokers/migros/sixBook.mjs leaves
// out (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.dcbank.ch/angebot/anlegen/
//   https://www.dcbank.ch/wp-content/uploads/2024/01/Execution_Only_01.01.2024.pdf
//   Fees: https://www.dcbank.ch/wp-content/uploads/2025/03/DCB_Leistungen_und_Gebuehren_01.01.2025-Web.pdf
//
//   node brokers/dcbank/dcbank_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "DC Bank",
  out: new URL("dcbank-parsed.json", import.meta.url),
});
