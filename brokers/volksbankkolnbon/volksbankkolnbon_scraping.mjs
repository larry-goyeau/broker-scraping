// What Volksbank Köln Bonn sells in its Wertpapierdepot on the German place,
// with no login.
//
//   https://www.volksbank-koeln-bonn.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.volksbank-koeln-bonn.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// The depot page names no list of titles: "Handeln Sie einzelne Aktien und
// andere Wertpapiere an deutschen und internationalen Börsen", "aus einem
// großen Angebot an Aktien, ETFs und Fonds wählen". Its meinDepot fee is
// "4,95 € für alle dt. Börsenplätze". It names no segment, board, country
// or product type it leaves out, so the catalogue is the whole German place
// on every German exchange the shared module can read.
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
//   - Clients: a Volksbank Köln Bonn account with OnlineBanking ("Für die
//     Depoteröffnung brauchen Sie ein Konto mit OnlineBanking-Zugang bei
//     uns"); meinDepot up to age 30 and 50,000 EUR.
//   - "Direkthandel" in Brokerage+ (trading with a market maker off exchange)
//     has no exchange book; it is not a place here.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none; they stay and carry `nonEuResident`, as targobankde and
//     berlinersparkass do.
//
// Fees. Same depot page, "Depotmodelle, Konditionen und Gebühren",
// "Orderentgelte Inland Kommissionsgeschäft": VobaDepot 1,00 %, min. 25,00 €
// (online 50 % off); VobaDepot Premium 0,80 %, min. 25,00 € (online 50 %
// off); meinDepot "4,95 € für alle dt. Börsenplätze und Best Execution für
// 3,95 €"; custody 0,15 % / 0,12 % plus 20,00 € a year (meinDepot free).
//
//   node brokers/volksbankkolnbon/volksbankkolnbon_scraping.mjs
//   node brokers/volksbankkolnbon/volksbankkolnbon_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("volksbankkolnbon-parsed.json", import.meta.url);
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
