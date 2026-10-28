// What Clientis Entlebucher Bank sells on the exchange, with no login. Its
// place is Switzerland and it prints no list of the titles it trades. The
// execution-only page ("Direkt", "Selber entscheiden und wählen") is for
// clients who "wählt Anlageinstrumente selber aus und erteilt
// Börsenaufträge über e-Banking" ("Handel und Depotübersicht via
// e-Banking"). The factsheet's "Tarife für Abschlüsse in der Schweiz"
// cover "Aktien, ETF, Traded Options, Obligationen und ähnliche Papiere
// 0.85% (40% e-banking-Rabatt, min. CHF 50.–)". The Clientis depot and
// trading rules (section 11) name no venue, only "einem allgemein
// anerkannten, geeigneten ... Ausführungsplatz".
//
// So the book is the whole SIX Swiss Exchange book: shares, ETFs,
// ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency. No bank page names a segment, board or product it does not
// trade on SIX, so nothing is removed beyond what
// brokers/migros/sixBook.mjs leaves out (suspended, delisted, never-traded
// and dormant lines, rights, second trading lines; warrants, structured
// products and bonds are not read).
//
//   https://eb.clientis.ch/de/privatkunden/anlegen/execution-only
//   https://bankthur.clientis.ch/documents/d/global/cli-pu-2023-de-rechtliches-depot-und-handelsreglement
//   Fees: https://eb.clientis.ch/documents/2239571/4744872/ebs-factsheet-execution-only.pdf
//
//   node brokers/clientisentlebuc/clientisentlebuc_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Clientis Entlebucher Bank",
  out: new URL("clientisentlebuc-parsed.json", import.meta.url),
});
