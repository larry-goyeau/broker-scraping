// What Clientis Bank im Thal sells on the exchange, with no login. Its
// place is Switzerland and it prints no list of the titles it trades. The
// execution-only page ("Direkt", "Selber entscheiden und wählen") is for
// clients who "wählt Anlageinstrumente selber aus und erteilt
// Börsenaufträge über e-Banking", and the price list gives the "Direkt
// (Execution Only)" service the "Titeluniversum: Alle Produkte". Its
// "Tarife für Abschlüsse in der Schweiz" for "Aktien und ähnliche Papiere"
// run from 1.10 % up to CHF 50,000 to 0.45 % above CHF 200,000 (CHF 40
// minimum up to CHF 2,000, CHF 80 up to CHF 7,272), and "Für den
// Wertschriftenhandel über e-Banking werden Ihnen jeweils nur 50% der
// Standardkonditionen berechnet". The Clientis depot and trading rules
// (section 11) name no venue, only "einem allgemein anerkannten,
// geeigneten ... Ausführungsplatz".
//
// So the book is the whole SIX Swiss Exchange book: shares, ETFs,
// ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency. No bank page names a segment, board or product it does not
// trade on SIX, so nothing is removed beyond what
// brokers/migros/sixBook.mjs leaves out (suspended, delisted, never-traded
// and dormant lines, rights, second trading lines; warrants, structured
// products and bonds are not read).
//
//   https://bankimthal.clientis.ch/de/privatkunden/anlegen/execution-only
//   https://bankthur.clientis.ch/documents/d/global/cli-pu-2023-de-rechtliches-depot-und-handelsreglement
//   Fees: https://bankimthal.clientis.ch/documents/2073690/7848533/BIT_Preise_DL_WS_Geschaeft.pdf
//
//   node brokers/clientisimthal/clientisimthal_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Clientis Bank im Thal",
  out: new URL("clientisimthal-parsed.json", import.meta.url),
});
