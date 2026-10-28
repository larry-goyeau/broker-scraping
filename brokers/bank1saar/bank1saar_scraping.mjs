// What Bank 1 Saar sells on Börse Xetra, with no login.
//
//   https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depot-aktiv.html
//   https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// Bank 1 Saar is a Volksbank. Its online depot (Depot Aktiv) runs on the DZ
// BANK brokerage of the Volksbanken Raiffeisenbanken, inside OnlineBanking and
// the VR Banking App ("So haben Sie die Welt der Aktien, ETFs und Co. immer
// dabei"; "Weltweit Wertpapiere handeln"). The Depotmodelle folder says
// "Aktien, Anleihen und andere Wertpapiere handeln". The bank publishes no
// list of what it sells, and no page names a segment, a country or a product
// type it leaves out on Xetra.
//
// Place: Börse Xetra (broker-list.json). Frankfurt, Tradegate and the
// regional floors are not this place. Orders on foreign exchanges carry a
// surcharge ("Bei Transaktionen über ausländische Börsenplätze fällt ein
// Auslandsaufschlag an") and are another place.
//
// So the catalogue is the whole Xetra book as germanyBook() reads it
// (brokers/1822direkt/germanyBook.mjs, Deutsche Börse's daily
// t7-xetr-allTradableInstruments.csv): every share, ETF, ETN and ETC, one row
// per trading currency line, minus inactive, pending-deletion, not-yet-trading
// and suspended lines. Left out, as in every scraper: warrants, certificates,
// bonds and debt lines (withoutObligations). DZ BANK derivatives ("Handel von
// DZ-Bank Derivaten (eigene Emissionen der DZ-Bank)") and savings plans
// ("außerbörsliche Ausführung") are not Xetra lines.
//
// Remarks, not removals:
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as berlinervolksban and
//     1822direkt do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//
// Fees: https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depot-aktiv.html
// (Stand 01.10.2026): Depot Aktiv "Börsenorderentgelt pro Order Aktien bis
// 10.000,00 EUR Ordergegenwert 12,95 EUR", 24,95 EUR to 30.000 EUR, 49,95 EUR
// above; "Mindestentgelt pro Order 12,95 EUR".
//
//   node brokers/bank1saar/bank1saar_scraping.mjs
//   node brokers/bank1saar/bank1saar_scraping.mjs --fresh   (re-read the venue list)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("bank1saar-parsed.json", import.meta.url);
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
