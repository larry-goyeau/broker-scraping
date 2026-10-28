// What AEK BANK 1826 sells on the exchange, with no login. Its place is
// Switzerland and it prints no list of the titles it trades: its
// execution-only "Depot Anlagen Online" says "Sie legen Ihr Vermögen ganz
// ohne Beratung selbst an", and the price list has a courtage for
// "Handelsplatz Schweiz: Aktien, ETF, kotierte Anlagefonds, strukturierte
// Produkte, Warrants, Anrechte" (online 0.45 % up to 30,000, 45 CHF
// minimum). So the book is the whole SIX Swiss Exchange book: shares,
// ETFs, ETNs/ETCs and listed funds, one row per line, in the line's
// trading currency.
//
// No AEK page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines). Warrants and structured products are in the tariff but
// stay out, as in every other catalogue; bonds are not read.
//
//   https://www.aekbank.ch/privatkunden/Anlagen/Anlageloesungen/Depot-Anlagen-Online
//   Fees: https://www.aekbank.ch/dam/jcr:92abf7d1-911b-4167-8a30-1792abacb512/Dienstleistungs-_und_Preis%C3%BCbersicht_im_Anlagegesch%C3%A4ft.2026-01-14-16-03-36.pdf
//
//   node brokers/aek1826/aek1826_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "AEK BANK 1826",
  out: new URL("aek1826-parsed.json", import.meta.url),
});
