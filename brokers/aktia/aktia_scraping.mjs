// Aktia Bank (Finland) prints no list of its own. Its clients trade the
// shares listed on the Helsinki exchange, online in the netbank or through
// a branch, so the catalogue is the whole Nasdaq Helsinki main market book
// (helsinkiBook.mjs in this folder).
//
// What it sells, from its own pages (no login):
// - Share investing page: in the netbank you can open a book-entry account
//   "ja käydä kauppaa Helsingin Pörssiin listatuilla osakkeilla" (and trade
//   shares listed on the Helsinki exchange).
//   https://www.aktia.fi/fi/osakesijoitukset
// - FAQ "Miten aloitan osakesijoittamisen?": shares are bought in the
//   netbank, section "Säästöt ja sijoitukset" > "Osakkeet"; domestic share
//   orders are charged by the price list.
//   https://www.aktia.fi/fi/usein-kysytyt-kysymykset/kategoria/saastaminen-ja-sijoittaminen/aloita-saastaminen-ja-sijoittaminen/miten-aloitan-osakesijoittamisen
// - Investor bulletin, order execution: retail orders in "kotimaisia
//   pörssiosakkeita" (domestic listed shares) are always passed to Danske
//   Bank A/S, Finland branch; the instruments traded on a venue include
//   shares and "ETF-rahastojen osuudet".
//   https://misc.aktia.fi/data-service/documents/investment/Tietoja_sijoituspalveluista/Sijoittajatiedote/Sijoittajatiedote.pdf
//
// Kept: every Nasdaq Helsinki main market share (Large, Mid and Small Cap,
// Finnish or foreign) and the Helsinki ETF (Seligson OMX Helsinki 25): no
// Aktia page excludes ETFs, and the bulletin counts ETF units among the
// instruments it routes to a venue. Currency is the line's trading
// currency on Nasdaq (EUR).
// Left out:
// - First North Finland: no Aktia page names it, and it is another place
//   in broker-list.json.
// - Suspended, halted, delisted or never-traded lines (helsinkiBook.mjs).
// - Subscription rights, warrants, bonds and structured products, as in
//   the other scrapers.
//
// Fees (price list 1.9.2024, netbank: "Helsingin Pörssissä noteeratut
// osakkeet" 0.25 % + 10 € per executed order, no minimum):
// https://misc.aktia.fi/data-service/documents/investment/Hinnastot/Arvopaperipalvelut/Hinnasto_Arvopaperipalvelut.pdf
//
//   node brokers/aktia/aktia_scraping.mjs

import { writeHelsinkiCatalogue } from "./helsinkiBook.mjs";

await writeHelsinkiCatalogue(import.meta.url, "aktia-parsed.json", {
  types: ["STOCK", "ETF"],
  firstNorth: false,
});
