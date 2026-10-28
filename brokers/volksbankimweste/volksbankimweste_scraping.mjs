// What Volksbank im Westen (Volksbank, Germany) sells as shares, ETFs, ETNs and
// ETCs on the German place, with no login.
//
//   https://www.volksbank-im-westen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.volksbank-im-westen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// The depot page names no list of titles: "Handeln Sie einzelne Aktien und
// andere Wertpapiere an deutschen und internationalen Börsen", "aus einem
// großen Angebot an Aktien, ETFs und Fonds wählen"; the brokerage page: "So
// haben Sie die Welt der Aktien, ETFs und Co. immer dabei". Neither page
// names a segment, board, country or product type that is left out, so the
// catalogue is the whole German place on the German exchanges the shared
// modules can read.
//
// Venues. A Volksbank passes its customers' exchange orders to DZ BANK,
// whose execution policy for private clients ("Tabelle 2: Inländische
// Ausführungsplätze") names Börse Quotrix, Tradegate, Xetra, Frankfurt and
// Stuttgart, then the regional exchanges:
//   https://www.dzbank.de/content/dam/dzbank/dokumente/de/Footernavigation_DE/richtlinien-und-informationen/mifid-ii/Ausfuehrungsgrundsaetze_Privatkunden_DE.pdf
// The online brokerage manual of the Atruvia platform the Volksbanken share
// says these can be ordered online: "Aktien, Zertifikate und
// Optionsscheine (alle an einer inländischen Börse ... zugelassene
// Wertpapiere)":
//   https://atruvia.scene7.com/is/content/atruvia/20240112_Brokerage_Bedienungsanleitungpdf
// Rows: Xetra and Börse Frankfurt as germanyBook() reads them from Deutsche
// Börse's own daily lists of tradable instruments
// (brokers/1822direkt/germanyBook.mjs), and Tradegate as tradegateBook()
// reads it from Tradegate's own share and ETP price lists
// (brokers/tradegatedirect/tradegateBook.mjs), because on 25 October 2026
// ESMA's FIRDS register (germanyBook's Tradegate source) answered only part
// of Tradegate's lines. One row per title and venue, plus one per trading
// currency on Xetra (the line's own currency; Frankfurt and Tradegate trade
// in euro). Not covered: Stuttgart, München, Hamburg, Hannover,
// Düsseldorf/Quotrix, gettex and LS Exchange publish no readable instrument
// list (see germanyBook.mjs); Börse Berlin's floor closed on 1 January 2026.
//
// Left out:
//   - Lines that are not Active, past their last trading day, not yet
//     traded, or under a running FWB suspension (germanyBook); on Tradegate,
//     suspended lines (no quote and a "state" on the order book) and lines
//     Deutsche Börse marks PendingDeletion (tradegateBook).
//   - Warrants, certificates, bonds and Frankfurt's open-ended funds (FUN),
//     as in every scraper; debt lines by withoutObligations().
//   - Foreign exchanges: the bank routes there too, but its place here is
//     Germany only.
//
// Remarks, not removals:
//   - Clients: "Für die Depoteröffnung brauchen Sie ein Konto mit
//     OnlineBanking-Zugang bei uns".
//   - "Direkthandel" in Brokerage+ (brokerage page: "Direkthandel, schnelleres
//     Handeln"), trading with a market maker off exchange, has no exchange
//     book; it is not a place here.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none; they stay and carry `nonEuResident`, as targobankde and
//     volksbankkolnbon do.
//
// Fees (published, no login), same depot page, "Depotmodelle, Konditionen
// und Gebühren":
//   DirektDepot "Grundpreis je Order 12,50 €" plus "0,20 %" of the order
//   value, depot free "bei drei börslichen Orders pro Quartal, ansonsten 35,70
//   EUR pro Jahr"; meinDepot (up to age 30) "Grundpreis je Order 4,95 €",
//   "bei Ausführung als Best Execution 3,95 €".
//
//   node brokers/volksbankimweste/volksbankimweste_scraping.mjs
//   node brokers/volksbankimweste/volksbankimweste_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("volksbankimweste-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const VENUES = ["Xetra", "Frankfurt"];
const log = (m) => console.error(m);

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
  ...(await germanyBook({ venues: VENUES, fresh: FRESH, log })),
  ...(await tradegateBook({ fresh: FRESH, log })),
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

// A thin answer means a source failed: keep the previous file.
const perPlace = (mic) => kept.filter((r) => r.mic === mic).length;
if (perPlace("XETR") < 4000 || perPlace("XFRA") < 10000 || perPlace("XGAT") < 5000) {
  throw new Error(`too few rows: ${JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats })}`);
}
for (const [isin, mic] of [["DE0007164600", "XETR"], ["DE0007164600", "XGAT"], ["IE00B4L5Y983", "XETR"], ["US0378331005", "XFRA"], ["US0378331005", "XGAT"]]) {
  if (!kept.some((r) => r.isin === isin && r.mic === mic && r.currency === "EUR")) throw new Error(`${isin} on ${mic} missing`);
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
