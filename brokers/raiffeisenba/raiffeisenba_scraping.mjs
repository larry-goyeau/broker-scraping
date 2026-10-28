// What Raiffeisen CAPITAL (Raiffeisen CAPITAL a.d. Banja Luka, the
// brokerage arm of Raiffeisen Bank BiH) sells, with no login. Its only
// place is the Banja Luka Stock Exchange (Banjalučka berza, BLSE): its
// About us page says "As a member of the Banja Luka Stock Exchange (BLSE),
// we offer stock broking services and block transactions on the BLSE",
// and its e-trading page lets clients "directly place orders for trading on
// the BLSE", with "real time ... best buy/sell price for all securities in
// the market". The purchase and sale pages offer buying and selling
// securities with day, open or limited, limit or market orders. No page
// names a market segment, board, share class or line as out, so the
// catalogue is the whole BLSE share book: official market ("Službeno
// berzansko tržište") and free market ("Slobodno tržište"), ordinary (R)
// and preference (P) shares.
//
//   https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/o-nama.html
//   https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/e-trading.html
//   https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/brokerske-usluge-/kupovina-hartija-od-vrijednosti.html
//   https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/brokerske-usluge-/prodaja-hartija-od-vrijednosti.html
//   fees: https://www.raiffeisenbank.ba/content/dam/rbi/retail/eu/ba/raiffeisen-capital/dokumenti/Brokerage%20fees%20-%20Raiffeisen%20Capital%20JSC%20Banja%20Luka.pdf.coredownload.pdf
//         (sale and purchase of securities: KM 7.00 up to KM 100, KM 9.50
//          up to KM 500, then 2.00 % down to 0.80 % above KM 200,000;
//          exchange and Central Securities Register fees included)
//
// Left out, as the shared book does: bonds and treasury bills (on the
// tariff but not in this catalogue), suspended lines (all four reason
// groups of the exchange's suspension list), issuers in bankruptcy, in
// liquidation or being turned into a d.o.o., lines that never traded, and
// lines whose own page shows a delisting date, a status other than
// "Trading" or no ISIN. The exchange's fund list is empty and it lists no
// ETF, ETN or ETC. Every line trades in convertible marks (BAM), MIC XBLB.
// The book and the ISINs come from the exchange through ./blseBook.mjs
// (https://www.blberza.com, share list, suspension list, line pages).
//
//   node brokers/raiffeisenba/raiffeisenba_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { blseBook } from "./blseBook.mjs";

const OUTPUT = new URL("raiffeisenba-parsed.json", import.meta.url);

const rows = await blseBook({ log: console.error });
if (rows.length < 100) throw new Error(`only ${rows.length} Banja Luka lines came back`);
if (rows.some((row) => !row.isin || !/^BA/.test(row.isin))) throw new Error("a Banja Luka line without a Bosnian ISIN stayed in the book");
// The book must keep the big names; a broken read fails here.
for (const ticker of ["TLKM-R-A", "HETR-R-A", "BOKS-R-A"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Raiffeisen CAPITAL catalogue`);
}

const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));
console.error(`${stamped.length} Banja Luka lines written`);
