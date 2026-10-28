// What Clientis Bank Thur sells on the exchange, with no login. Its place
// is Switzerland and it prints no list of the titles it trades. The
// execution-only page ("Direkt", "Selber entscheiden und wählen") is for
// clients who "wählt Anlageinstrumente selber aus und erteilt
// Börsenaufträge über e-Banking" ("e-Banking: Handel- und
// Depotübersicht", "e-Banking-Rabatt auf Courtage 50%"). The factsheet's
// "Tarife für Abschlüsse in der Schweiz" cover "Aktien, Obligationen,
// strukturierte Derivate, ETF, Immobilienfonds, übrige
// Anlageinstrumente" (1.10 % up to CHF 100,000, at least CHF 100). The
// Clientis depot and trading rules (section 11) name no venue, only "einem
// allgemein anerkannten, geeigneten ... Ausführungsplatz".
//
// So the book is the whole SIX Swiss Exchange book: shares, ETFs,
// ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency. No bank page names a segment, board or product it does not
// trade on SIX, so nothing is removed beyond what
// brokers/migros/sixBook.mjs leaves out (suspended, delisted, never-traded
// and dormant lines, rights, second trading lines; warrants, structured
// products and bonds are not read).
//
//   https://bankthur.clientis.ch/de/privatkunden/anlegen/execution-only
//   https://bankthur.clientis.ch/documents/d/global/cli-pu-2023-de-rechtliches-depot-und-handelsreglement
//   Fees: https://bankthur.clientis.ch/documents/2050824/4685435/bat-factsheet-execution-only.pdf
//
//   node brokers/clientisthur/clientisthur_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Clientis Bank Thur",
  out: new URL("clientisthur-parsed.json", import.meta.url),
});
