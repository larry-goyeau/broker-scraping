// ACRO verðbréf hf. (Reykjavik) prints no list of its own. Its app is for
// trading shares on the Iceland exchange, with every company's order book,
// so the catalogue is the whole Nasdaq Iceland main market book
// (icelandBook.mjs in this folder).
//
// What it sells, from its own pages (no login):
// - ACRO app page: the app is for individuals who want to trade
//   "hlutabréf í Kauphöll Íslands" (shares on the Iceland exchange), and
//   gives "Aðgangur að tilboðsbókum allra félaga í Kauphöllinni" (access
//   to the order books of every company on the exchange).
//   https://acro.is/app/
// - Brokerage page: ACRO handles the "miðlun innlendra og erlendra
//   verðbréfa, jafnt skráðra sem óskráðra" (brokering of domestic and
//   foreign securities, listed and unlisted) and has been a member of
//   "Kauphöll Íslands, Nasdaq Iceland" since 1997.
//   https://acro.is/vefbrefamidlun/
//
// Kept: every Nasdaq Iceland main market share (Large, Mid and Small Cap,
// Icelandic or foreign: Arion banki, Íslandsbanki, Alvotech, Amaroq, JBT
// Marel, Oculis...) and the Iceland ETF (Landsbréf - LEQ UCITS ETF): no
// ACRO page excludes ETFs, and the price list charges every listed
// domestic security ("skráð bréf"). Currency is the line's trading
// currency on Nasdaq (ISK).
// Left out:
// - First North Iceland: no ACRO page names it, and it is another place
//   in broker-list.json ("Nasdaq First North Iceland").
// - Suspended, halted, delisted or never-traded lines (icelandBook.mjs).
// - Unlisted shares, bonds, bills, warrants and mutual funds, as in the
//   other scrapers.
//
// Fees (price list valid from 16 April 2026, "Innlend hlutabréf": listed
// shares in the ACRO app 0.65 %, minimum 1,750 kr; other listed shares
// 1.0 %, minimum 5,000 kr; custody 0.15 % a year):
// https://acro.is/wp-content/uploads/2026/04/5.01-Reglubok-ACRO-Gjaldskra.pdf
//
//   node brokers/acro/acro_scraping.mjs

import { writeIcelandCatalogue } from "./icelandBook.mjs";

await writeIcelandCatalogue(import.meta.url, "acro-parsed.json", {
  types: ["STOCK", "ETF"],
  firstNorth: false,
});
