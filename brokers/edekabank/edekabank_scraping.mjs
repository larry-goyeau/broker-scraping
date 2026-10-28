// What EDEKABANK AG (Hamburg) sells on the German exchanges in its
// EDEKA-Depot Aktiv, with no login.
//
//   https://www.edekabank.de/privatkunden/geldanlage/depot-brokerage/edeka-depot_aktiv.html
//
// The depot runs on the cooperative banks' DZ BANK brokerage inside
// OnlineBanking and the MyBanking App. The bank publishes no list of what it
// sells. The page says "Sicherer Wertpapierhandel an allen Börsenplätzen"
// and "Handel mit Aktien, Anleihen, Fonds, Zertifikaten und Optionsscheinen
// an allen deutschen und internationalen Handelsplätzen". No page names a
// segment, a country or a product type it leaves out; broker-list.json names
// no restriction either.
//
// Places. "An allen deutschen ... Handelsplätzen" takes every German venue.
// The venues read here are Börse Xetra and Börse
// Frankfurt through germanyBook() (brokers/1822direkt/germanyBook.mjs, Deutsche
// Börse's own instrument files) and Tradegate through tradegateBook()
// (brokers/tradegatedirect/tradegateBook.mjs, Tradegate's own price lists;
// germanyBook's FIRDS route for Tradegate answered only 2,593 lines on 25
// October 2026, as ESMA's register held a partial load).
// gettex, Stuttgart, München, Hamburg, Hannover and Düsseldorf publish no
// instrument file and are not read by either module. Börse Berlin's floor
// closed on 1 January 2026.
// Orders abroad ("mind. 34,95 EUR im Ausland") are another place.
//
// So the catalogue is the whole German place on those three venues: every
// share, ETF, ETN and ETC listed there, one row per venue (and per trading
// currency on Xetra), minus inactive, delisting, not-yet-trading and
// suspended lines. Left out, as in every scraper: warrants, certificates,
// bonds, Frankfurt's open-ended funds ("FUN") and debt lines
// (withoutObligations).
//
// Remarks, not removals:
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde and
//     1822direkt do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//
// Fees: https://atruvia.scene7.com/is/content/atruvia/wertpapiergeschaeft_preis_und_leistungsverzeichnis_20260115
// (Preis- und Leistungsverzeichnis, Stand 15.01.2026, 9.1.1.1):
// Onlinegeschäft "0,20 % vom Kurswert max. 59,95 EUR", "mind. 9,95 EUR im
// Inland", plus the exchanges' and correspondents' costs; same figures on
// the depot page.
//
//   node brokers/edekabank/edekabank_scraping.mjs
//   node brokers/edekabank/edekabank_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("edekabank-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Xetra", "Frankfurt"];

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const german = await germanyBook({ venues: VENUES, fresh: FRESH, log: (m) => console.error(m) });
const tradegate = await tradegateBook({ fresh: FRESH, log: (m) => console.error(m) });
const book = [...german, ...tradegate.map(({ list, ...r }) => r)];
const rows = book.map((r) => (noKid(r) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));

if (kept.length < 30000) throw new Error(`only ${kept.length} lines`);
for (const [isin, place] of [["DE0007164600", "Börse Xetra"], ["DE0007164600", "Börse Frankfurt"], ["IE00B4L5Y983", "Börse Xetra"], ["US0378331005", "Börse Frankfurt"], ["IE00B4L5Y983", "Tradegate"], ["US0378331005", "Tradegate"]]) {
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
