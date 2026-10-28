// What Volksbank Gronau-Ahaus sells in its Wertpapierdepot on the German
// place, with no login.
//
//   https://www.vbga.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.vbga.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// The bank publishes no list of titles. The depot page: "Handeln Sie
// einzelne Aktien und andere Wertpapiere an deutschen und internationalen
// Börsen", "aus einem großen Angebot an Aktien, ETFs und Fonds wählen"; it
// prices orders "im Inland" and adds a surcharge on "Auslandsorder".
//
// Places. Like every Volksbank on the Atruvia / DZ BANK platform, the bank
// passes exchange orders to DZ BANK and prices "Inland" (domestic) orders as
// one tariff without naming the German venues one by one. DZ BANK's
// execution policy for private clients ("Stand: August 2023"):
//   https://www.dzbank.de/content/dam/dzbank/dokumente/de/Footernavigation_DE/richtlinien-und-informationen/mifid-ii/Ausfuehrungsgrundsaetze_Privatkunden_DE.pdf
// "Tabelle 2: Inländische Ausführungsplätze", for "Eigenkapitalinstrumente,
// ETP´s" under Best Execution: Börse Quotrix, Börse Tradegate, Börse Xetra,
// Börse Frankfurt, Börse Stuttgart; the regional floors (Berlin,
// Düsseldorf, Hamburg, Hannover, München, Stuttgart) "wenn Ausführung an
// den o.g. Wertpapierbörsen nicht möglich". The rows are the named venues a
// shared module can read: Börse Xetra and Börse Frankfurt from Deutsche
// Börse's own daily lists of tradable instruments (germanyBook,
// brokers/1822direkt/germanyBook.mjs), and Tradegate from Tradegate's own
// two price lists, shares and ETPs (tradegateBook,
// brokers/tradegatedirect/tradegateBook.mjs). germanyBook can read Tradegate
// from ESMA's FIRDS register too, but on 25 October 2026 FIRDS answered only
// 2,610 Tradegate lines, so the exchange's own lists are used (as
// volksbankkolnbon does). One row per title and venue, plus one per trading
// currency on Xetra (the line's own currency; Frankfurt and Tradegate trade
// in euro). Stuttgart, Quotrix/Düsseldorf, Hamburg, Hannover and München
// publish no instrument list that can be read (see germanyBook.mjs); Börse
// Berlin's floor closed on 1 January 2026. Foreign exchanges are outside the
// place "Germany".
//
// What is sold. The online brokerage manual of the Atruvia platform:
//   https://atruvia.scene7.com/is/content/atruvia/20240112_Brokerage_Bedienungsanleitungpdf
// "Folgende Wertpapiere können online geordert werden: Aktien, Zertifikate
// und Optionsscheine (alle an einer inländischen Börse ... zugelassene
// Wertpapiere)", "börsliche Renten und Fonds". No page of the bank names a
// segment, board, country or product type it leaves out on a German
// exchange, so the catalogue is the whole German place on those venues:
// every share, ETF, ETN and ETC listed there.
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
//   - Clients: "Für die Depoteröffnung brauchen Sie ein Konto mit
//     OnlineBanking-Zugang bei uns"; meinDepot is "für junge Kunden unter
//     31".
//   - "Direkthandel" in Brokerage+ (the manual: "im Direkthandel bestimmte
//     Wertpapiere der DZ BANK außerbörslich ... zu kaufen bzw. zu
//     verkaufen") has no exchange book; it is not a place here.
//   - No KID, no buy for a retail client in the EEA (PRIIPs Regulation
//     1286/2014 art. 13). US- and Canada-domiciled ETPs and Swiss (CH) ETFs
//     have none; they stay and carry `nonEuResident`, as targobankde and
//     volksbankkolnbon do; the Swiss ETF registered for sale in Germany
//     (CH0226976816) stays open.
//
// Fees. Depot page ("Stand 01.07.2026"), "Entgelte für Transaktionen
// (online)": Depot.Klassik "0,5 % zzgl. 10,00 €"; Depot.Online "0,25 %
// zzgl. 10,00 €", "Maximalpreis im Inland" 60,00 €; meinDepot 3,95 € ("Gilt
// nur für inländische Best-Execution-Orders. Ansonsten 4,95 €"), max.
// 4,95 €; "Aufschlag auf Auslandsorder" 25,00 € (meinDepot 19,90 €).
// Depotentgelt: Depot.Klassik 0,15 % p.a. below 100,000 €; Depot.Online 0 €
// "Ab drei Börsentransaktionen pro Quartal, ansonsten 15 € pro Quartal".
//   https://www.vbga.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//
// Row: { query, ticker, name, exchange, mic, currency, type, isin, raw }
// (+ nonEuResident); ticker = query = the Deutsche Börse short code
// (Mnemonic) shared by every German venue, else Tradegate's code, else the
// ISIN.
//
//   node brokers/volksbankgronaua/volksbankgronaua_scraping.mjs
//   node brokers/volksbankgronaua/volksbankgronaua_scraping.mjs --fresh   (re-read the venue lists)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("volksbankgronaua-parsed.json", import.meta.url);
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

// A thin answer means a source failed: keep the previous file.
const perMic = (mic) => kept.filter((r) => r.mic === mic).length;
if (perMic("XETR") < 4000 || perMic("XFRA") < 10000 || perMic("XGAT") < 5000) {
  throw new Error(`too few lines: XETR ${perMic("XETR")}, XFRA ${perMic("XFRA")}, XGAT ${perMic("XGAT")}`);
}
for (const [isin, mic] of [["DE0007164600", "XETR"], ["DE0007164600", "XFRA"], ["IE00B4L5Y983", "XETR"], ["IE00B4L5Y983", "XGAT"], ["US0378331005", "XGAT"]]) {
  if (!kept.some((r) => r.isin === isin && r.mic === mic)) throw new Error(`${isin} on ${mic} missing`);
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byVenue = {};
for (const r of kept) {
  const v = (byVenue[r.exchange] ??= {});
  v[r.type] = (v[r.type] || 0) + 1;
}
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles: ${Object.entries(byVenue).map(([x, t]) => `${x} (${Object.entries(t).map(([k, n]) => `${n} ${k}`).join(", ")})`).join("; ")}; ` +
  `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
