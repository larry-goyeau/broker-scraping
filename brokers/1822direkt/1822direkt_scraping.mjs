// What 1822direkt (the direct bank of Frankfurter Sparkasse) sells on the
// German exchanges, with no login.
//
//   https://www.1822direkt.de/anlegen-depot/wertpapierdepot/
//   https://www.1822direkt.de/anlegen-depot/wertpapierangebot/
//
// The bank publishes no list of what it sells. Its pages say "Handel an 10
// deutschen Börsen, 39 Auslandsbörsen und 15 Direkthandelspartner" and, for
// shares, "An 10 deutschen Börsen & 39 Auslandsbörsen bequem handeln"; for
// ETFs, "Über 2.700 ETFs zur Auswahl". No page names a segment, a country or a
// product type it leaves out on the German exchanges.
//
// Places. The ten German exchanges are not named one by one. The securities
// FAQ (https://www.1822direkt.de/service/fragen-und-antworten/wertpapier-faqs/)
// names Tradegate ("Diese beiden Varianten sind nur am Handelsplatz Tradegate
// möglich") and, under the "börslicher Quotehandel" tab, gettex and Quotrix.
// So the places here are Börse Xetra and Börse Frankfurt (the default German
// venues) plus Tradegate:
//   - Xetra and Frankfurt as germanyBook() reads them from Deutsche Börse's
//     tradable-instrument files (brokers/1822direkt/germanyBook.mjs);
//   - Tradegate as tradegateBook() reads it from Tradegate's own share and ETP
//     price lists (brokers/tradegatedirect/tradegateBook.mjs). germanyBook()
//     can read Tradegate from ESMA's FIRDS register, but on 25 October 2026
//     FIRDS answered only 2,446 Tradegate equity records (10,981 lines the day
//     before), while Tradegate's own lists are complete.
// gettex, Quotrix, Stuttgart, München, Hamburg, Hannover and Düsseldorf
// publish no instrument file and are not read by these modules. Börse
// Berlin's floor closed on 1 January 2026.
// Direct trading with Lang & Schwarz, Baader, Société Générale and the other
// "Direkthandelspartner" (https://www.1822direkt.de/anlegen-depot/wertpapierangebot/direkthandel/)
// has no exchange book: it is a remark, not a place.
//
// So the catalogue is the whole German place on those three venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and suspended
// lines. Left out, as in every scraper: warrants, certificates, bonds,
// Frankfurt's open-ended funds ("FUN") and debt lines (withoutObligations).
//
// Remarks, not removals:
//   - Clients: the site addresses residents of Germany only, and not "US-
//     Personen im Sinne der Regulation S" nor residents of the UK, Canada and
//     Japan (footer of every page).
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde does; the
//     Swiss ETF registered for sale in Germany (CH0226976816) stays open.
//
// Fees: https://www.1822direkt.de/anlegen-depot/leistungen-und-konditionen/
// "An- und Verkauf von Wertpapieren an inländischen Börsen: Grundentgelt +
// Orderprovision 4,90 € zzgl. 0,25% vom Kurswert mindestens 9,90 € maximal
// 54,90 €", "Handelsplatzentgelt 2,95 €", plus the exchange's own costs.
//
//   node brokers/1822direkt/1822direkt_scraping.mjs
//   node brokers/1822direkt/1822direkt_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "./germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("1822direkt-parsed.json", import.meta.url);
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
