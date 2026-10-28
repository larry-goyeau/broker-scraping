// What Spar- und Leihkasse Frutigen (SLF) sells on the exchange, with no
// login. Its place is Switzerland and it prints no list of the titles it
// trades. The execution-only page says the bank is the client's link to
// the exchange ("Execution only-Kunden nutzen unsere Bank als Verbindung
// zur Börse") and "Bei der Wahl der Anlageinstrumente verfügen Sie über
// vollständige Handels- und Entscheidungsfreiheit". Its FIDLEG brochure
// lists what execution-only clients can buy: "Aktien, Forderungspapiere,
// Anteile an kollektiven Kapitalanlagen, strukturierte Produkte, Derivate".
// The fees are one rate for every Swiss order: "Courtage pro Auftrag
// Inland max. 0.60 %", "Keine Mindest-Courtage für Inlandaufträge".
//
// So the book is the whole SIX Swiss Exchange book (no bank page names
// another Swiss venue): shares, ETFs, ETNs/ETCs and listed funds, one row
// per line, in the line's trading currency. No bank page names a segment,
// board or product it does not trade on SIX, so nothing is removed beyond
// what brokers/migros/sixBook.mjs leaves out (suspended, delisted,
// never-traded and dormant lines, rights, second trading lines; warrants,
// structured products and bonds are not read).
//
//   https://www.slfrutigen.ch/anlegen/execution-only
//   https://www.slfrutigen.ch/media/5vqj1o2v/slf_anlagegeschäft_2025_rebranding.pdf
//   Fees: https://www.slfrutigen.ch/media/mrccjutk/flyer_execution-only.pdf
//
//   node brokers/sparundleihkasse/sparundleihkasse_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Spar- und Leihkasse Frutigen",
  out: new URL("sparundleihkasse-parsed.json", import.meta.url),
});
