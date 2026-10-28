// What Regiobank Solothurn sells on the exchange, with no login. Its place
// is the SIX Swiss Exchange and it prints no list of the titles it trades:
// "Mit regioTrading erhalten Sie Zugang zu den Finanzmärkten. Wir
// konzentrieren uns auf die reine Übermittlung und Ausführung Ihrer
// Börsenaufträge (execution only)", with "Schnelle Auftragserteilung via
// E-Banking und Mobile App". The fee sheet (V8, 01.07.2026) has a
// "Courtage regioTrading – Auftragserteilung via E-Banking" with a column
// "Aktien und ETF CH" (60 CHF minimum, 0.600 % from 1,000) and one for
// "Anlagefonds/Strukturierte Produkte". So the book is the whole SIX Swiss
// Exchange book: shares, ETFs, ETNs/ETCs and listed funds, one row per line,
// in the line's trading currency.
//
// No Regiobank page names a segment, board or product it does not trade on
// SIX, so nothing is removed beyond what brokers/migros/sixBook.mjs leaves
// out (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.regiobank.ch/privatkunden-anlegen-handel#selbst-anlegen
//   Fees: https://www.regiobank.ch/hubfs/08_Medien/05_Dokumente/Gebuehren/Gebuehren_Dienstleistungsangebot_Wertschriften_2023.pdf
//
//   node brokers/regiobanksolothu/regiobanksolothu_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Regiobank Solothurn",
  out: new URL("regiobanksolothu-parsed.json", import.meta.url),
});
