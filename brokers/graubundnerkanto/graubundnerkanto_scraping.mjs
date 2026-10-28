// What Graubündner Kantonalbank (GKB) sells on the exchange, with no login.
// Its place is the SIX Swiss Exchange and it prints no list of the titles it
// trades: the e-banking page says "Nutzen Sie unsere sichere
// Banking-Lösung auch für Ihre Börsenaufträge" and "Aufträge an die SIX
// Swiss Exchange übermitteln wir online". The price list ("Gültig ab 07.
// 2026") has a "Wertschriftenhandel" courtage for "Aktien Schweiz" (80 CHF
// minimum, 0.95 % under 50,000), says the rates apply to "Beteiligungspapiere
// ... sowie für börsengehandelte Fonds", and "Aufträge via e-Banking
// geniessen eine Reduktion von 50 %". So the book is the whole SIX Swiss
// Exchange book: shares, ETFs, ETNs/ETCs and listed funds, one row per line,
// in the line's trading currency.
//
// No GKB page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.gkb.ch/de/private/digital-banking/e-banking
//   Fees: https://www.gkb.ch/content/dam/gkb/dokumente/private/Preise-Ueberblick-DE.pdf
//
//   node brokers/graubundnerkanto/graubundnerkanto_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Graubündner Kantonalbank",
  out: new URL("graubundnerkanto-parsed.json", import.meta.url),
});
