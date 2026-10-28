// What Glarner Regionalbank (GRB) sells on the exchange, with no login.
// GRB's place is Switzerland and it prints no list of the titles it trades:
// its self-directed solution «Fuchs» gives "unsere sichere
// Handelsplattform sowie ein modernes E-Banking", and its price list has a
// tariff for "Abschlüsse in der Schweiz: Aktien, strukturierte Produkte,
// ETFs und ähnliche Wertpapiere" (80 CHF minimum, 1.00 % up to 50,000,
// 50 % off through e-banking). So the book is the whole SIX Swiss Exchange
// book: shares, ETFs, ETNs/ETCs and listed funds, one row per line, in the
// line's trading currency.
//
// The "Anlageinstrumente_Aktien-und-Aktienfonds.pdf" linked as the
// broker's page is a two-page brochure that explains what shares and
// equity funds are; it lists no titles and excludes nothing. No GRB page
// names a segment, board or product the bank does not trade on SIX, so
// nothing is removed beyond what brokers/migros/sixBook.mjs leaves out
// (suspended, delisted, never-traded and dormant lines, rights, second
// trading lines; warrants, structured products and bonds are not read).
//
//   https://grb.ch/unsere-produkte/anlegen/anlegen-in-eigenregie
//   https://grb.ch/fileadmin/user_upload/Anlegen/01_PDFs/Anlageinstrumente_Aktien-und-Aktienfonds.pdf
//   Fees: https://grb.ch/fileadmin/user_upload/Diverses/01_PDFs/GRB_Dienstleistungen_und_Preise_2026.pdf
//
//   node brokers/glarnerregionalb/glarnerregionalb_scraping.mjs

import { writeSixCatalogue } from "../migros/sixBook.mjs";

await writeSixCatalogue({
  broker: "Glarner Regionalbank",
  out: new URL("glarnerregionalb-parsed.json", import.meta.url),
});
