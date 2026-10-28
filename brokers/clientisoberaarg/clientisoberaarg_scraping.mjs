// What Clientis Bank Oberaargau sells on the exchange, with no login. Its
// place is Switzerland and it prints no list of the titles it trades. The
// execution-only page ("Selber entscheiden und wählen") is for clients who
// "wählt Anlageinstrumente selber aus und erteilt Börsenaufträge über
// e-Banking", with "Handel und Depotübersicht via e-Banking". The price
// list (Stand Januar 2026) has one "Börsentransaktionen" tariff (1.10 % up
// to CHF 50,000, falling to 0.20 % above CHF 500,000, at least CHF 80)
// and "Abschlüsse via e-Banking und Mobile Banking App: 60 % der
// ordentlichen Courtage, mind. CHF 50.-". The bank's depot and trading
// rules (Clientis Depot- und Handelsreglement, section 11) name no venue,
// only "einem allgemein anerkannten, geeigneten ... Ausführungsplatz".
//
// So the book is the whole SIX Swiss Exchange book: shares, ETFs,
// ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency. No bank page names a segment, board or product it does not
// trade on SIX, so nothing is removed beyond what
// brokers/migros/sixBook.mjs leaves out (suspended, delisted, never-traded
// and dormant lines, rights, second trading lines; warrants, structured
// products and bonds are not read).
//
//   https://bankoberaargau.clientis.ch/de/privatkunden/anlegen/execution-only
//   https://bankthur.clientis.ch/documents/d/global/cli-pu-2023-de-rechtliches-depot-und-handelsreglement
//   Fees: https://bankoberaargau.clientis.ch/documents/2043432/4745831/BOA_Preise_Dienstleistungen_Wertschriftengeschaeft.pdf
//
//   node brokers/clientisoberaarg/clientisoberaarg_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Clientis Bank Oberaargau",
  out: new URL("clientisoberaarg-parsed.json", import.meta.url),
});
