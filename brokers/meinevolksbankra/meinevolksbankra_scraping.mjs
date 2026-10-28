// What meine Volksbank Raiffeisenbank eG (Rosenheim) sells on the German
// exchanges, with no login.
//
//   https://www.vb-rb.de/privatkunden/anlegen-sparen/depot-und-brokerage/wertpapierdepot.html
//
// The depot runs on the cooperative banks' online brokerage (OnlineBanking and
// VR Banking App, DZ BANK / Atruvia). The bank publishes no list of what it
// sells: "Handeln Sie mit Aktien, Anleihen, Fonds, ETFs und weiteren
// Wertpapieren – an allen deutschen sowie an den meisten internationalen
// Börsen- und Handelsplätzen", and in the FAQ "Mit dem Brokerage haben Sie die
// Möglichkeit, Ihre Wertpapiere an allen nationalen und den wichtigsten
// internationalen Börsen zu handeln". No page names a segment, a country or a
// product type it leaves out.
//
// Places: "all German exchanges", so every German venue that publishes its
// book:
//   - Börse Xetra and Börse Frankfurt as germanyBook() reads them from
//     Deutsche Börse's tradable-instrument files
//     (brokers/1822direkt/germanyBook.mjs);
//   - Tradegate as tradegateBook() reads it from Tradegate's own share and ETP
//     price lists (brokers/tradegatedirect/tradegateBook.mjs). germanyBook()
//     can read Tradegate from ESMA's FIRDS register, but on 25 October 2026
//     FIRDS answered only 2,446 Tradegate equity records (10,981 lines the day
//     before), while Tradegate's own lists are complete.
// gettex, Quotrix, Stuttgart, München, Hamburg, Hannover and Düsseldorf
// publish no instrument file and are not read by these modules. Börse
// Berlin's floor closed on 1 January 2026. Direct trading with market makers
// ("Direkthandel" in Brokerage+) has no exchange book.
//
// So the catalogue is the whole German place on those three venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and suspended
// lines. Left out, as in every scraper: warrants, certificates, bonds,
// Frankfurt's open-ended funds ("FUN") and debt lines (withoutObligations).
//
// Remarks, not removals:
//   - Clients: "Um dieses Angebot und alle Vorteile nutzen zu können, brauchen
//     Sie ein Konto bei uns"; the depot is opened in OnlineBanking.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde does; the
//     Swiss ETF registered for sale in Germany (CH0226976816) stays open.
//
// Fees: https://www.vb-rb.de/privatkunden/anlegen-sparen/depot-und-brokerage/wertpapierdepot.html
// "Aktien, Investmentanteile (über Börse), Optionsscheine, Zertifikate: 0,25 %
// vom Kurswert, mind. 9,95 Euro / max. 59,95 Euro (Ausland mind. 35 Euro zzgl.
// Fremdgebühren)"; the Preis- und Leistungsverzeichnis
// (https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnispdf,
// "Stand: 01.09.2026") gives the same eBrokerage rate.
//
//   node brokers/meinevolksbankra/meinevolksbankra_scraping.mjs
//   node brokers/meinevolksbankra/meinevolksbankra_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("meinevolksbankra-parsed.json", import.meta.url);
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
