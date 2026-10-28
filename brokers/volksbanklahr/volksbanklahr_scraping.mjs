// What Volksbank Lahr (Germany) sells as shares, ETFs, ETNs and ETCs on the
// German exchanges, with no login.
//
// Fees (published, no login), "Persönliche Beratung" and "Brokerage/Mobile":
//   https://www.volksbank-lahr.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
// "Aktien und aktienähnliche Werte": Brokerage/Mobile "0,25% Provision vom
// Kurswert, mind. 12,50 Euro, max. 59,90 Euro + Fremde Gebühren" (adviser
// "1% Provision vom Kurswert, mind. 25,00 Euro"); the same for
// "Investmentanteile über Börse". The same page: "Handeln Sie einzelne Aktien
// und andere Wertpapiere an deutschen und internationalen Börsen." Brokerage
// page ("So haben Sie die Welt der Aktien, ETFs und Co. immer dabei."):
//   https://www.volksbank-lahr.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/brokerage.html
//
// Venues. A bank of the Volksbanken Raiffeisenbanken group passes its
// customers' exchange orders to DZ BANK, whose execution policy for private
// clients (annex to the
// "Sonderbedingungen für Wertpapiergeschäfte", "Stand: August 2023"):
//   https://www.dzbank.de/content/dam/dzbank/dokumente/de/Footernavigation_DE/richtlinien-und-informationen/mifid-ii/Ausfuehrungsgrundsaetze_Privatkunden_DE.pdf
// lists, in "Tabelle 2: Inländische Ausführungsplätze", the Best Execution
// venues for "Eigenkapitalinstrumente, ETP´s": Börse Quotrix, Börse
// Tradegate, Börse Xetra, Börse Frankfurt, Börse Stuttgart; and, "wenn
// Ausführung an den o.g. Wertpapierbörsen nicht möglich", Berlin,
// Düsseldorf, Hamburg, Hannover, München, Stuttgart. A customer can also
// pick any German exchange himself (the fee table above).
// The rows are Börse Xetra (one row per trading currency: Xetra has USD,
// GBP, CHF... lines) and Börse Frankfurt, as germanyBook() reads them from
// Deutsche Börse's tradable-instrument files
// (brokers/1822direkt/germanyBook.mjs), and Tradegate, as tradegateBook()
// reads it from Tradegate's own share and ETP price lists
// (brokers/tradegatedirect/tradegateBook.mjs), in euro. germanyBook() can
// read Tradegate from ESMA's FIRDS register, but on 25 October 2026 FIRDS
// answered only 2,446 Tradegate equity records (10,981 the day before);
// 1822direkt reads Tradegate the same way. Not covered, because those
// exchanges publish no instrument file: Stuttgart, Quotrix/Düsseldorf,
// Hamburg, Hannover, München. Börse Berlin's floor closed on 1 January 2026.
//
// What is sold. The online brokerage manual of the Atruvia platform the
// Volksbanken share (linked from VR Bank RheinAhrEifel's brokerage page):
//   https://atruvia.scene7.com/is/content/atruvia/20240112_Brokerage_Bedienungsanleitungpdf
// says these can be ordered online: "Aktien, Zertifikate und
// Optionsscheine (alle an einer inländischen Börse ... zugelassene
// Wertpapiere)" and "börsliche Renten und Fonds". No page of the bank
// excludes ETFs, ETNs, ETCs, a segment or foreign shares listed in Germany,
// so the catalogue is the whole German place on those three venues: shares
// (CS lines, ADRs, REITs), ETFs, ETNs and ETCs, minus inactive, delisting,
// not-yet-trading and suspended lines (the two modules say how). Left out,
// as in every scraper: warrants, certificates, bonds and debt lines
// (withoutObligations), and Frankfurt's open-ended mutual funds ("FUN").
// Left out too: "Direkthandel", off-exchange trading in "bestimmte
// Wertpapiere der DZ BANK" (the same manual), which has no exchange book;
// and the foreign exchanges, which are not this broker's place in
// broker-list.json ("Germany" only).
//
// Remarks, not removals: no KID, no buy for a retail client in the EEA
// (PRIIPs Regulation 1286/2014 art. 13). US- and Canada-domiciled ETPs and
// Swiss (CH) ETFs have none; they stay and carry `nonEuResident`, as
// targobankde and 1822direkt do. The Swiss ETF registered for sale in
// Germany (CH0226976816) stays open.
//
// Row: { query, ticker, name, exchange, mic, currency, type, isin, wkn, raw }
// as the two modules return it; ticker = query = the Deutsche Börse short
// code (Mnemonic) shared by every German venue, else Tradegate's code, else
// the ISIN.
//
//   node brokers/volksbanklahr/volksbanklahr_scraping.mjs
//   node brokers/volksbanklahr/volksbanklahr_scraping.mjs --fresh   (re-read the venue lists)

import { germanyBook } from "../1822direkt/germanyBook.mjs";
import { tradegateBook } from "../tradegatedirect/tradegateBook.mjs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const OUTPUT = new URL("volksbanklahr-parsed.json", import.meta.url);
const FRESH = process.argv.includes("--fresh");
const log = (m) => console.error(m);

// A Swiss ETF registered for sale in Germany (targobankde, FactSet
// registration list "Switzerland, Germany").
const CH_REGISTERED = new Set(["CH0226976816"]);

function noKid(row, list) {
  const country = row.isin.slice(0, 2);
  if ((list === "etp" || row.type !== "STOCK") && (country === "US" || country === "CA")) return true;
  return row.type === "ETF" && country === "CH" && !/\bETP\b/i.test(row.name) && !CH_REGISTERED.has(row.isin);
}

const book = [
  ...(await germanyBook({ venues: ["Xetra", "Frankfurt"], fresh: FRESH, log })),
  ...(await tradegateBook({ fresh: FRESH, log })),
];
const rows = book.map(({ list, ...r }) => (noKid(r, list) ? { ...r, nonEuResident: true } : r));
const kept = stampRows(withoutObligations(rows));
kept.sort((a, b) => a.name.localeCompare(b.name) || a.isin.localeCompare(b.isin) || a.exchange.localeCompare(b.exchange) || a.currency.localeCompare(b.currency));

// A thin answer means a source failed: keep the previous file.
const perPlace = (place) => kept.filter((r) => r.exchange === place).length;
if (perPlace("Börse Xetra") < 4000 || perPlace("Börse Frankfurt") < 10000 || perPlace("Tradegate") < 5000) {
  throw new Error(`too few rows: ${JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats })}`);
}
for (const [isin, place] of [
  ["DE0007164600", "Börse Xetra"], // SAP
  ["DE0007164600", "Börse Frankfurt"],
  ["DE0007164600", "Tradegate"],
  ["IE00B4L5Y983", "Börse Xetra"], // iShares Core MSCI World
  ["IE00B4L5Y983", "Tradegate"],
  ["US0378331005", "Tradegate"], // Apple
]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place && r.currency === "EUR")) throw new Error(`${isin} is missing on ${place}`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const count = {};
for (const r of kept) count[`${r.exchange} ${r.type}`] = (count[`${r.exchange} ${r.type}`] || 0) + 1;
console.error(
  `${kept.length} rows, ${new Set(kept.map((r) => r.isin)).size} titles (${Object.entries(count).map(([k, n]) => `${n} ${k}`).join(", ")}); ` +
    `${book.length - kept.length} dropped as debt; nonEuResident (no KID): ${kept.filter((r) => r.nonEuResident).length}`,
);
console.error(JSON.stringify({ germanyBook: germanyBook.stats, tradegateBook: tradegateBook.stats }));
