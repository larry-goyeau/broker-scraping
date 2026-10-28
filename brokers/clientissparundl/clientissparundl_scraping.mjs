// What Clientis Spar- und Leihkasse Thayngen sells on the exchange, with no
// login. Its place is Switzerland and it prints no list of the titles it
// trades: the digital-banking page says "Kaufen und verkaufen Sie
// Wertpapiere direkt über Ihr Konto", and the securities price list has a
// tariff for "Tarife für Abschlüsse in der Schweiz – An- und Verkauf:
// Aktien, ETF, Traded Options und ähnliche Papiere" (80 CHF minimum,
// 1.10 % up to 50,000, 50 % off through e-banking). So the book is the
// whole SIX Swiss Exchange book: shares, ETFs, ETNs/ETCs and listed funds,
// one row per line, in the line's trading currency.
//
// No bank page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://thayngen.clientis.ch/de/digital-banking
//   Fees: https://thayngen.clientis.ch/documents/2154777/4757904/THA_Preise_DL_WS_Geschaeft.pdf/b8bdadb2-b2d3-6ee4-a6cc-e222314856b5?t=1562661684957
//
//   node brokers/clientissparundl/clientissparundl_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Clientis Spar- und Leihkasse Thayngen",
  out: new URL("clientissparundl-parsed.json", import.meta.url),
});
