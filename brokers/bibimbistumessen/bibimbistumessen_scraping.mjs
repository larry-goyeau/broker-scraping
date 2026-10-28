// What BIB - Bank im Bistum Essen sells on Börse Xetra, with no login.
//
//   https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// BIB's BIB Direkt-Depot runs on the DZ BANK brokerage of the Volksbanken
// Raiffeisenbanken, inside OnlineBanking and the VR Banking App ("So haben
// Sie die Welt der Aktien, ETFs und Co. immer dabei"). The depot page says
// "Handeln Sie einzelne Aktien und andere Wertpapiere an deutschen und
// internationalen Börsen", and its tariff covers "Anleihen, Aktien,
// Optionsscheine, fremde Zertifikate, börsengehandelte Investmentfonds". The
// bank publishes no list of what it sells, and no page names a segment, a
// country or a product type it leaves out on Xetra.
//
// Place: Börse Xetra (broker-list.json; the tariff notes "Teilausführungen in
// XETRA"). Frankfurt, Tradegate and the regional floors are not this place.
// "Börsenkommissionsgeschäft international 45,00 € Stückpreis" is another
// place.
//
// So the catalogue is the whole Xetra book as germanyBook() reads it
// (brokers/1822direkt/germanyBook.mjs, Deutsche Börse's daily
// t7-xetr-allTradableInstruments.csv): every share, ETF, ETN and ETC, one row
// per trading currency line, minus inactive, pending-deletion, not-yet-trading
// and suspended lines. Left out, as in every scraper: warrants, certificates,
// bonds and debt lines (withoutObligations). Funds and DZ BANK certificates
// bought "Über die Fondsgesellschaft oder die DZ BANK" are not Xetra lines.
//
// Remarks, not removals:
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as berlinervolksban and
//     1822direkt do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//
// Fees: https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
// BIB Direkt-Depot, Brokerage, "Börsenkommissionsgeschäft national": up to
// 10,00 € "3,00 €", above "0,25% vom Kurswert, mind. 9,90 €", plus third-party
// costs; "Jahrespauschale pro Depot zzt. frei".
//
//   node brokers/bibimbistumessen/bibimbistumessen_scraping.mjs
//   node brokers/bibimbistumessen/bibimbistumessen_scraping.mjs --fresh   (re-read the venue list)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bibimbistumessen-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Xetra"];

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = await germanyBook({ venues: VENUES, fresh: FRESH, log: (m) => console.error(m) });
const rows = book.map((r) => (noKid(r) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 4000) throw new Error(`only ${kept.length} lines`);
for (const isin of ["DE0007164600", "IE00B4L5Y983", "US0378331005"]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === "Börse Xetra")) throw new Error(`${isin} missing on Börse Xetra`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[r.type] = (count[r.type] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify(germanyBook.stats));
