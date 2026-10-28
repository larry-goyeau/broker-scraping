// What VR Bank München Land eG (Germany) sells as shares, ETFs, ETNs and
// ETCs on the German exchanges.
//
//   https://www.vr-bank-muenchen-land.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.vr-bank-muenchen-land.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// The depot page says "Handeln Sie einzelne Aktien und andere Wertpapiere an
// deutschen und internationalen Börsen" and "aus einem großen Angebot an
// Aktien, ETFs und Fonds wählen". The bank publishes no list of what it
// sells.
//
// Fees (published, no login): the depot page, "Depotmodelle, Konditionen
// und Gebühren": "Aktien, Optionsscheine, Investmentfonds, Verzinsliche
// Wertpapiere ..." by order value, "0,01 - 4.999,99 Euro 9,95 Euro",
// "5.000,00 - 24.999,99 Euro 0,25 %", "25.000,00 bis 99.999,99 Euro
// 0,20 %", "Ab 100.000,00 Euro 0,15 %"; unexecuted limit orders "2,50 Euro
// pro Auftrag".
//   https://www.vr-bank-muenchen-land.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//
// Places. broker-list.json gives the bank one place, "Germany". The bank
// names no single venue: its online order book is the Volksbank (Atruvia /
// DZ BANK) brokerage, which routes to the domestic exchanges. The rows are
// Börse Xetra (one row per trading currency: Xetra has USD, GBP, CHF...
// lines) and Börse Frankfurt, as germanyBook() reads them from Deutsche
// Börse's tradable-instrument files (brokers/1822direkt/germanyBook.mjs),
// and Tradegate, in euro, as tradegateBook() reads it from Tradegate's own
// share and ETP price lists (brokers/tradegatedirect/tradegateBook.mjs).
// On 25 October 2026 ESMA's FIRDS answered only about 2,600 Tradegate
// equity records, so germanyBook() is not used for Tradegate (as in
// volksbankraiffei and 1822direkt).
//   - Not covered: Stuttgart, München, gettex, Hamburg, Hannover,
//     Düsseldorf/Quotrix and LS Exchange. They publish no instrument list.
//   - Börse Berlin: its floor closed on 1 January 2026.
//   - Direct trading ("Direkthandel" in Brokerage+): no exchange book.
//   - Foreign exchanges: the bank routes there too ("an deutschen und
//     internationalen Börsen"), but its place here is Germany only.
//
// What is kept: all listed shares, ETFs, ETNs and ETCs of those venues. No
// page of the bank names an exception: no segment, board, ETF or foreign
// line is excluded. Left out, as in the other scrapers: warrants,
// certificates, bonds, open-ended funds that are not exchange-traded
// (Frankfurt's FUN lines), and lines that are suspended, delisted (Inactive
// or PendingDeletion on Deutsche Börse's lists, last trading day passed) or
// not yet traded. withoutObligations removes the few notes left in the share
// lists.
//
// Remark, not removal: no KID, no buy for a retail client in the EEA
// (PRIIPs Regulation 1286/2014 art. 13). US- and Canada-domiciled ETPs and
// Swiss (CH) ETFs have none. They stay and carry nonEuResident, as
// targobankde and 1822direkt do; the Swiss ETF registered for sale in
// Germany (CH0226976816) stays open.
//
// Row: { query, ticker, name, exchange, mic, currency, type, isin, wkn, raw }
// as the two modules return it; ticker = query = the Deutsche Börse short
// code (Mnemonic) shared by every German venue, else Tradegate's code, else
// the ISIN.
// Currency is the line's trading currency on that venue.
//
//   node brokers/vrmunchenland/vrmunchenland_scraping.mjs
//   node brokers/vrmunchenland/vrmunchenland_scraping.mjs --fresh   (re-read the venue lists)

import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const OUTPUT = new URL("vrmunchenland-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const log = (m) => console.error(m);

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row, list) {
  const country = row.isin.slice(0, 2);
  if ((list === "etp" || row.type !== "STOCK") && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = [
  ...(await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log })),
  ...(await tradegateBook({ fresh: FRESH, log })),
];
const rows = book.map(({ list, ...r }) => (noKid(r, list) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));
kept.sort((a, b) => a.name.localeCompare(b.name) || a.isin.localeCompare(b.isin) || a.exchange.localeCompare(b.exchange) || a.currency.localeCompare(b.currency));

// A thin answer means a source failed: keep the previous file.
const perPlace = (place) => kept.filter((r) => r.exchange === place).length;
if (perPlace("Börse Xetra") < 4000 || perPlace("Börse Frankfurt") < 10000 || perPlace("Tradegate") < 5000) {
  throw new Error(`too few rows: ${JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats })}`);
}
for (const [isin, place] of [
  ["DE0007164600", "Börse Xetra"], // SAP
  ["DE0007164600", "Börse Frankfurt"],
  ["DE0007164600", "Tradegate"],
  ["IE00B4L5Y983", "Börse Xetra"], // iShares Core MSCI World
  ["IE00B4L5Y983", "Tradegate"],
  ["US0378331005", "Tradegate"], // Apple
]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place && r.currency === "EUR")) throw new Error(`${isin} is missing on ${place}`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.currency} ${row.type}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.error(`${key}: ${count}`);
console.error(`${kept.length} rows written to ${OUTPUT.pathname}; nonEuResident: ${kept.filter((r) => r.nonEuResident).length}`);
console.error(JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats }));
