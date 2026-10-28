// What Bank für Kirche und Diakonie eG (KD-Bank) sells on the German
// exchanges, with no login.
//
//   https://www.kd-bank.de/privatkunden/geldanlange/depot.html
//
// The depot runs on the cooperative banks' online brokerage (OnlineBanking and
// VR Banking App, DZ BANK / Atruvia). The bank publishes no list of what it
// sells: "Mit einem Wertpapierdepot können Sie aus einem großen Angebot an
// Aktien, ETFs und Fonds wählen" and "Handeln Sie einzelne Aktien und andere
// Wertpapiere an deutschen und internationalen Börsen". No page names a
// segment, a country or a product type it leaves out; the bank's
// sustainability criteria apply to its own fund selection ("Fonds mit
// Nachhaltigkeitsstrategie"), not to orders the client places.
//
// Places: the pages name no German exchange, so the default German venues,
// Börse Xetra and Börse Frankfurt, as germanyBook() reads them from Deutsche
// Börse's tradable-instrument files (brokers/1822direkt/germanyBook.mjs).
// Tradegate, gettex and the regional floors are not named on the bank's
// pages and are left out. Börse Berlin's floor closed on 1 January 2026.
// Direct trading with market makers ("Direkthandel" in Brokerage+) has no
// exchange book.
//
// So the catalogue is the whole German place on those two venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and suspended
// lines. Left out, as in every scraper: warrants, certificates, bonds,
// Frankfurt's open-ended funds ("FUN") and debt lines (withoutObligations).
//
// Remarks, not removals:
//   - Clients: "Für die Depoteröffnung brauchen Sie ein Konto mit
//     OnlineBanking-Zugang bei uns."
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde does; the
//     Swiss ETF registered for sale in Germany (CH0226976816) stays open.
//
// Fees: https://www.kd-bank.de/privatkunden/geldanlange/depot.html
// "Internetorder 0,10 % vom Kurswert" ("Beratungsorder 0,50 % - 0,70 % vom
// Kurswert"); custody "Grundpreis 17,85 Euro (inkl. USt.) pro Jahr", "Festpreis
// je Posten 5,95 Euro (inkl. USt.) pro Jahr". The full Preis- und
// Leistungsverzeichnis is sent on request.
//
//   node brokers/kdbank/kdbank_scraping.mjs
//   node brokers/kdbank/kdbank_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("kdbank-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log: (m) => console.error(m) });
const rows = book.map((r) => (noKid(r) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 20000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Börse Xetra"], ["US0378331005", "Börse Frankfurt"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify(germanyBook.stats));
