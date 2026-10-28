// What Obwaldner Kantonalbank (OKB) sells on the exchange, with no login.
// Its place is the SIX Swiss Exchange and it prints no list of the titles it
// trades: the e-banking page offers "Wertschriftenhandel ... Börsentitel
// kaufen und verkaufen". The price list (1 October 2026) has a "Tarif
// Aktien" for "Aktien, Partizipationsscheine, Genussscheine, Optionsscheine,
// Strukturierte Produkte, Exchange Traded Funds (ETF), Exchange Traded
// Commodities (ETC), und ähnliche Papiere (Schweiz und Ausland)" (1.00 % up
// to 49,999.99, 40 CHF minimum online) and a "Tarif Fonds" for
// "Anlagefonds". So the book is the whole SIX Swiss Exchange book: shares,
// ETFs, ETNs/ETCs and listed funds, one row per line, in the line's trading
// currency.
//
// The price list warns that "der Erwerb bestimmter Fondsklassen nur im
// Zusammenhang mit einem Beratungs- oder Vermögensverwaltungsauftrag
// zugelassen ist": that depends on the client's mandate, so it is a remark,
// not a removal. No OKB page names a segment, board or product it does not
// trade on SIX, so nothing is removed beyond what brokers/migros/sixBook.mjs
// leaves out (suspended, delisted, never-traded and dormant lines, rights,
// second trading lines; warrants, structured products and bonds are not
// read).
//
//   https://www.okb.ch/private/e-services/digital-banking/e-banking
//   Fees: https://www.okb.ch/.dam/01d39e05-351f-4923-94d0-4fb81d40b6f4/OKB-Preisliste.pdf
//
//   node brokers/obwaldnerkantona/obwaldnerkantona_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Obwaldner Kantonalbank",
  out: new URL("obwaldnerkantona-parsed.json", import.meta.url),
});
