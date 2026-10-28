// What VR PartnerBank eG Chattengau-Schwalm-Eder (a Volksbank) sells on the
// German exchanges, with no login.
//
//   https://www.vr-partnerbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.vr-partnerbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// The depot runs on the cooperative banks' online brokerage (OnlineBanking and
// VR Banking App, DZ BANK / Atruvia). The bank publishes no list of what it
// sells: "Handeln Sie einzelne Aktien und andere Wertpapiere an deutschen und
// internationalen Börsen", and on meinDepot "An allen deutschen und mehreren
// internationalen Börsen handeln" with "Aktien, ETFs, Fonds, Zertifikate,
// Optionsscheine/Hebelprodukte, Anleihen". No page names a segment, a country
// or a product type it leaves out.
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
//   - Clients: "Für die Depoteröffnung brauchen Sie ein Konto mit
//     OnlineBanking-Zugang bei uns"; meinDepot is for clients aged 18 to 30.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none. They stay and carry `nonEuResident`, as targobankde does; the
//     Swiss ETF registered for sale in Germany (CH0226976816) stays open.
//
// Fees: https://www.vr-partnerbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
// "Order online": meinDepot (18-30) 2,00 €; VR PartnerTrading and VR
// PartnerAnlage "0,25 % vom Kurswert (ab 5.000 €, darunter 12,50 €)".
//
//   node brokers/vrpartnerbank/vrpartnerbank_scraping.mjs
//   node brokers/vrpartnerbank/vrpartnerbank_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("vrpartnerbank-parsed.json", import.meta.url);
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
