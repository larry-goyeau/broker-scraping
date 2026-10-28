// What Bank EKI sells on the exchange, with no login. Its place is
// Switzerland and it prints no list of the titles it trades. The Execution
// Only page says "Erledigen Sie Ihre Aufträge selbständig via E-Banking"
// and promises "Vollständige Handels- und Entscheidungsfreiheit". The fee
// schedule has one courtage for "Aktien, andere Beteiligungspapiere und
// Obligationen, Exchange Traded Funds, strukturierte Produkte,
// Anlagefonds, Derivate" (0.40 % up to CHF 50,000, minimum CHF 20, plus
// "Fremdgebühren"). So the book is the whole SIX Swiss Exchange book:
// shares, ETFs, ETNs/ETCs and listed funds, one row per line, in the line's
// trading currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.bankeki.ch/privatkunden/anlegen/execution-only
//   https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/3._Anlegen/Factsheet_Execution_Only.pdf
//   Fees: https://www.bankeki.ch/fileadmin/Website_2020/Dokumente/Prospekte/Gebuehrentarif.pdf
//
//   node brokers/eki/eki_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Bank EKI",
  out: new URL("eki-parsed.json", import.meta.url),
});
