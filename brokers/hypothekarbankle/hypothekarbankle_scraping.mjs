// What Hypothekarbank Lenzburg (HBL) sells on the exchange, with no login.
// Its place is Switzerland and it prints no list of the titles it trades:
// its execution-only solution Solo says "Sie legen die Produkte Ihrer Wahl
// via E-Banking an", and the price list "Wertschriftendienstleistungen"
// gives Solo a courtage on "Aktien, Aktien- und Strategiefonds, Anrechte"
// (1.10 % up to 50,000, 80 CHF minimum per "Börsenauftrag", 50 % off via
// e-banking, 40 CHF minimum). So the book is the whole SIX Swiss Exchange
// book: shares, ETFs, ETNs/ETCs and listed funds, one row per line, in the
// line's trading currency.
//
// No HBL page names a segment, board or product it does not trade on SIX,
// so nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://www.hbl.ch/de/private/anlegen/solo/
//   Fees: https://www.hbl.ch/media/ll1lqwia/wertschriftendienstleistungen.pdf
//
//   node brokers/hypothekarbankle/hypothekarbankle_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Hypothekarbank Lenzburg",
  out: new URL("hypothekarbankle-parsed.json", import.meta.url),
});
