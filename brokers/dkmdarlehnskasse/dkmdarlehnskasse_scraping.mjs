// What DKM Darlehnskasse Münster sells in its Wertpapierdepot on the German
// place, with no login.
//
//   https://www.dkm.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.dkm.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// The depot page names no list of titles: "Handel mit Aktien, Anleihen,
// Fonds, Zertifikaten und Optionsscheinen an allen deutschen und
// internationalen Handelsplätzen". It names no segment, board, country or
// product type it leaves out, so the catalogue is the whole German place on
// every German exchange the shared module can read.
//
// Places. Xetra and Börse Frankfurt as germanyBook() reads them from
// Deutsche Börse's own daily lists of tradable instruments
// (brokers/1822direkt/germanyBook.mjs), and Tradegate as tradegateBook()
// reads it from Tradegate's own two price lists, shares and ETPs
// (brokers/tradegatedirect/tradegateBook.mjs). germanyBook can also give
// Tradegate from ESMA's FIRDS register, but on 25 October 2026 FIRDS
// answered only about 2,600 of Tradegate's share and ETF lines (6,917 XGAT
// records in all), so the exchange's own lists are used. One row per title
// and venue, plus one per trading currency on Xetra (the line's own
// currency; Frankfurt and Tradegate trade in euro). The regional floors (Stuttgart, München, Hamburg, Hannover,
// Düsseldorf), gettex and LS Exchange are German venues too, but no
// instrument list of theirs can be read (see germanyBook.mjs); Börse
// Berlin's floor closed on 1 January 2026.
//
// Left out:
//   - Lines that are not Active, past their last trading day, not yet
//     traded, or under a running FWB suspension (germanyBook); on Tradegate,
//     suspended lines (no quote and a "state" on the order book) and lines
//     Deutsche Börse marks PendingDeletion (tradegateBook).
//   - Warrants, certificates, bonds and Frankfurt's open-ended funds (FUN),
//     as in every scraper; debt lines by withoutObligations().
//
// Remarks, not removals:
//   - Clients: a DKM account with OnlineBanking ("Für die Depoteröffnung
//     brauchen Sie ein Konto mit OnlineBanking-Zugang bei uns").
//   - "Direkthandel" in the Atruvia Brokerage+ (trading with a market maker
//     off exchange) has no exchange book; it is not a place here.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none; they stay and carry `nonEuResident`, as targobankde and
//     berlinersparkass do.
//
// Fees. Preisaushang (1 Oct 2026), "Wertpapiere", "Ausführung im Inland":
// shares "Online-Brokerage: 0,19 % zzgl. Courtage mind. 10,00 EUR max.
// 60,00 EUR" (in person 0,50 %, min. 30,00 EUR); ETFs the same online
// (3 % in person); "jährlicher Preis pro Depot 14,88 EUR":
//   https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-7
//
//   node brokers/dkmdarlehnskasse/dkmdarlehnskasse_scraping.mjs
//   node brokers/dkmdarlehnskasse/dkmdarlehnskasse_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("dkmdarlehnskasse-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Xetra", "Frankfurt"];

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row) {
  const country = row.isin.slice(0, 2);
  if (row.list === "etp" && (country === "US" || country === "CA")) return true;
  if (row.type !== "STOCK" && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = [
  ...(await germanyBook({ venues: VENUES, fresh: FRESH, log: (m) => console.error(m) })),
  ...(await tradegateBook({ fresh: FRESH, log: (m) => console.error(m) })),
];
const rows = book.map((r) => {
  const row = {
    query: r.query, ticker: r.ticker, name: r.name, exchange: r.exchange, mic: r.mic,
    currency: r.currency, type: r.type, isin: r.isin, raw: r.raw,
  };
  if (noKid(r)) row.nonEuResident = true;
  return row;
});
const kept = stampRows(withoutObligations(rows));

if (kept.length < 25000) throw new Error(`only ${kept.length} lines`);
for (const [isin, mic] of [["DE0007164600", "XETR"], ["IE00B4L5Y983", "XETR"], ["US0378331005", "XFRA"], ["US0378331005", "XGAT"]]) {
  if (!kept.some((r) => r.isin === isin && r.mic === mic)) throw new Error(`${isin} on ${mic} missing`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byVenue = {};
for (const r of kept) {
  const v = (byVenue[r.exchange] ??= {});
  v[r.type] = (v[r.type] || 0) + 1;
}
console.error(
  `${kept.length} lines: ${Object.entries(byVenue).map(([x, t]) => `${x} (${Object.entries(t).map(([k, n]) => `${n} ${k}`).join(", ")})`).join("; ")}; ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
