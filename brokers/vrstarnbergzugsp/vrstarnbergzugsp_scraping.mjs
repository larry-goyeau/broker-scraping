// What VR Bank Starnberg-Zugspitze eG sells on the German exchanges, with
// no login.
//
//   https://www.vrsta-zugspitze.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//   https://www.vrsta-zugspitze.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//
// The bank publishes no list of what it sells. Its depot page says "Handeln
// Sie einzelne Aktien und andere Wertpapiere an deutschen und
// internationalen Börsen" and "aus einem großen Angebot an Aktien, ETFs und
// Fonds wählen".
//
// Places. Like the other Volksbanken on the DZ BANK / Atruvia online
// brokerage, the bank prices orders on "inländische Börsen" as one tariff and
// does not name the German venues one by one. So the places are the German
// venues that publish their book:
//   - Börse Xetra and Börse Frankfurt as germanyBook() reads them from
//     Deutsche Börse's tradable-instrument files
//     (brokers/1822direkt/germanyBook.mjs);
//   - Tradegate as tradegateBook() reads it from Tradegate's own share and
//     ETP price lists (brokers/tradegatedirect/tradegateBook.mjs), as
//     vrpartnerbank does. germanyBook() can read Tradegate from ESMA's FIRDS
//     register, but on 25 October 2026 FIRDS was being reloaded and answered
//     only 2,446 to 3,100 Tradegate equity records (10,981 lines the day
//     before).
// The regional floors (Stuttgart, München, Düsseldorf, Hamburg, Hannover),
// gettex and Quotrix publish no instrument file and are not read by these
// modules. Börse Berlin's floor closed on 1 January 2026. "Direkthandel" in
// Brokerage+ (trading with a market maker) has no exchange book: a remark,
// not a place. Foreign exchanges ("ausländische Börsenplätze") are outside
// the place "Germany".
//
// So the catalogue is the whole German place on those three venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and
// suspended lines. No page of the bank names a segment, a country or a
// product type it leaves out. Left out, as in every scraper: warrants,
// certificates, bonds, Frankfurt's open-ended funds ("FUN") and debt lines
// (withoutObligations).
//
// Remark, not a removal: no KID, no buy for a retail client in the EEA
// (PRIIPs Regulation 1286/2014 art. 13). US- and Canada-domiciled ETPs and
// Swiss (CH) ETFs have none. They stay and carry `nonEuResident`, as
// targobankde and vrpartnerbank do; the Swiss ETF registered for sale in
// Germany (CH0226976816) stays open.
//
// Fees: Preis- und Leistungsverzeichnis (Stand 01.07.2026), section 9.1.1
// https://atruvia.scene7.com/is/content/atruvia/PLVpdf-42
// Shares, depot "im Inland", Online-Brokerage: "bis 4.999,99 EUR: 0,50",
// "bis 9.999,99 EUR: 0,40", "ab 10.000,00 EUR: 0,30" % of the order value,
// "mind. 15,00 EUR"; meinDepot (young clients up to 30): 3,95 EUR with Best
// Execution, 4,95 EUR on any domestic exchange.
//
//   node brokers/vrstarnbergzugsp/vrstarnbergzugsp_scraping.mjs
//   node brokers/vrstarnbergzugsp/vrstarnbergzugsp_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("vrstarnbergzugsp-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if ((row.list === "etp" || row.type !== "STOCK") && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const log = (m) => console.error(m);
const book = [
  ...(await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log })),
  ...(await tradegateBook({ fresh: FRESH, log })),
];
const rows = book.map(({ list, ...r }) => (noKid({ ...r, list }) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 25000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Tradegate"], ["US0378331005", "Tradegate"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats }));
