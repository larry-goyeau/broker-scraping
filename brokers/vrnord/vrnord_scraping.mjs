// What VR Bank Nord (Volksbank, Schleswig-Holstein, Germany) sells as shares,
// ETFs, ETNs and ETCs on the German exchanges.
//
// The bank's depot page says "Handeln Sie einzelne Aktien und andere
// Wertpapiere an deutschen und internationalen Börsen", and its meinDepot
// page "An allen deutschen und mehreren internationalen Börsen handeln" and
// "Orderpauschale für alle inländischen Börsen":
//   https://www.vrbanknord.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
//   https://www.vrbanknord.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
//
// Fees: "Handelsgebühr pro Online-Auftrag ab 9,95 €" on the depot page
// above, and in the Preisaushang (Stand 09.10.2026), Ausführung im Inland,
// Online-Brokerage: shares "0,40 % vom Kurswert, mind. 9,95 EUR".
//   https://atruvia.scene7.com/is/content/atruvia/aktueller-preisaushangpdf-1
//
// Places. broker-list.json gives the bank one place, "Germany". The bank does
// not name single venues on its pages: it says "alle inländischen Börsen",
// and its online order book is the Volksbank (Atruvia) brokerage, which
// routes to every German exchange. The German venues the shared module
// brokers/1822direkt/germanyBook.mjs can list are used: Börse Xetra, Börse
// Frankfurt and Tradegate, one row per title and venue, plus one per trading
// currency on Xetra (USD, GBP, CHF... lines). Its sources are Deutsche
// Börse's daily lists of tradable instruments for Xetra and Frankfurt and
// Tradegate's records in ESMA's FIRDS register.
//   - Not covered: Stuttgart, München, gettex, Hamburg, Hannover,
//     Düsseldorf/Quotrix and LS Exchange. They publish no instrument list.
//     Most of their shares and ETFs also trade on Frankfurt or Tradegate.
//   - Börse Berlin: its floor closed on 1 January 2026.
//   - Direct trading with DZ BANK or other issuers ("Außerbörslich", "DZ BANK
//     Derivate"): no exchange book, and it is mostly certificates and
//     warrants.
//   - Foreign exchanges: the bank routes there too, but its place here is
//     Germany only.
//
// What is kept: all listed shares, ETFs, ETNs and ETCs of those venues. The
// bank names no exception on its pages: no segment, board, ETF or foreign
// line is excluded there. Left out, as in the other scrapers: warrants,
// bonds, open-ended funds that are not exchange-traded (Frankfurt's FUN
// lines), and lines that are suspended, delisted (Inactive or
// PendingDeletion on Deutsche Börse's lists, last trading day passed) or not
// yet traded. withoutObligations removes the few notes left in the share
// lists.
//
// Remark, not removal: an ETF domiciled outside the EEA (US ETFs on
// Tradegate) has no KID for an EEA retail client (PRIIPs Regulation
// 1286/2014), so it carries nonEuResident, as targobankde does.
//
// Row: ticker and query are the Deutsche Börse short code (Mnemonic), which
// every German venue shares; the ISIN when a line has none. Currency is the
// line's trading currency on that venue.
//
//   node brokers/vrnord/vrnord_scraping.mjs
//   node brokers/vrnord/vrnord_scraping.mjs --fresh   (rebuild the shared day cache)

import { stampRows, EEA } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { germanyBook } from "../1822direkt/germanyBook.mjs";
import fs from "node:fs";

const OUTPUT = new URL("vrnord-parsed.json", import.meta.url);
const VENUES = ["Xetra", "Frankfurt", "Tradegate"];
const FRESH = process.argv.includes("--fresh");

// Tradegate's lines come from ESMA's FIRDS register. When the register
// answers too few of them (on 25 October 2026 it held 2,446 live Tradegate
// share and ETF records, against about 11,000 the day before), the run goes
// on with Xetra and Frankfurt and says so.
let rows;
let venues = VENUES;
try {
  rows = await germanyBook({ venues, fresh: FRESH, log: (m) => console.error(m) });
} catch (error) {
  if (!/^Tradegate:/.test(error.message)) throw error;
  console.error(`WARNING ${error.message}: Tradegate left out of this run`);
  venues = VENUES.filter((v) => v !== "Tradegate");
  rows = await germanyBook({ venues, fresh: FRESH, log: (m) => console.error(m) });
}
const withTradegate = venues.includes("Tradegate");

// An ETF domiciled outside the EEA has no KID for an EEA retail client: a
// remark on the client, the line stays.
for (const row of rows) if (row.type === "ETF" && !EEA.includes(row.isin.slice(0, 2))) row.nonEuResident = true;

const kept = stampRows(withoutObligations(rows));

const need = (isin, exchange) => {
  if (!kept.some((r) => r.isin === isin && r.exchange === exchange && r.currency === "EUR")) throw new Error(`${isin} is missing on ${exchange}`);
};
for (const exchange of ["Börse Xetra", "Börse Frankfurt"]) need("DE0007164600", exchange); // SAP
need("IE00B4L5Y983", "Börse Xetra"); // iShares Core MSCI World
need("US0378331005", "Börse Frankfurt"); // Apple
if (withTradegate) for (const isin of ["DE0007164600", "IE00B4L5Y983", "US0378331005"]) need(isin, "Tradegate");
if (kept.length < (withTradegate ? 30000 : 20000)) throw new Error(`only ${kept.length} rows`);

fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) {
  const key = `${row.exchange} ${row.currency} ${row.type}`;
  counts[key] = (counts[key] || 0) + 1;
}
for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.error(`${key}: ${count}`);
console.error(`${kept.length} rows written to ${OUTPUT.pathname}`);
